import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, Request, Response } from "express";
import { execute, query } from "./db";
import { createMailer, Mailer } from "./email";
import { parseEmailList } from "./auth";
import { requireAdmin } from "./middleware/requireAuth";

export interface InterestRequest {
  email: string;
  name: string;
  createdAt: string;
}

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
// Loose on purpose: a typo only costs the admin a bounced invite.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HOUR = 60 * 60 * 1000;
/** Each address (nginx's X-Real-IP) can send this many requests per hour. */
const RATE_LIMIT = { max: 5, windowMs: HOUR };
/**
 * Bot checks. The form asks for a signed token when the page loads, and a
 * submission is only saved if the token is at least MIN_FILL_MS old (people
 * take longer than that to type an email) and not expired.
 */
const MIN_FILL_MS = 3000;
const TOKEN_TTL_MS = 24 * HOUR;
/** At most this many "someone registered" emails go to the admins per hour, so a flood can't fill their inbox. */
const MAX_NOTIFICATIONS_PER_HOUR = 10;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// interest_requests also has a `note` column from the first version of the form; it's no longer collected.
export async function listInterestRequests(): Promise<InterestRequest[]> {
  const rows = await query<{ email: string; name: string; created_at: Date }>(
    "SELECT email, name, created_at FROM interest_requests ORDER BY created_at DESC, email"
  );
  return rows.map((r) => ({ email: r.email, name: r.name, createdAt: r.created_at.toISOString() }));
}

export interface InterestRouterDeps {
  mailer?: Mailer;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export function createInterestRouter({ mailer = createMailer(), env = process.env, now = Date.now }: InterestRouterDeps = {}): Router {
  const router = Router();
  const hits = new Map<string, number[]>();
  const notified: number[] = [];
  const secret = env.BETTER_AUTH_SECRET || "dev-secret-change-me-dev-secret";

  const sign = (issuedAt: string) => createHmac("sha256", secret).update(`interest:${issuedAt}`).digest("base64url");

  function issueToken(): string {
    const issuedAt = String(now());
    return `${issuedAt}.${sign(issuedAt)}`;
  }

  /** Whether the token is one we issued, old enough to have been filled in by a person, and not expired. */
  function validToken(token: unknown): boolean {
    if (typeof token !== "string") return false;
    const [issuedAt, signature = ""] = token.split(".");
    const expected = sign(issuedAt);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    const age = now() - Number(issuedAt);
    return age >= MIN_FILL_MS && age <= TOKEN_TTL_MS;
  }

  function rateLimited(req: Request): boolean {
    const key = (req.headers["x-real-ip"] as string | undefined) ?? req.socket.remoteAddress ?? "unknown";
    const since = now() - RATE_LIMIT.windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > since);
    recent.push(now());
    hits.set(key, recent);
    // Drop stale addresses now and then so the map can't grow forever.
    if (hits.size > 10_000) for (const [k, times] of hits) if (times.every((t) => t <= since)) hits.delete(k);
    return recent.length > RATE_LIMIT.max;
  }

  /** Lets the admins know someone's waiting. Failures are logged, not shown to the visitor. */
  async function notifyAdmins(request: Omit<InterestRequest, "createdAt">): Promise<void> {
    while (notified.length && notified[0] <= now() - HOUR) notified.shift();
    if (notified.length >= MAX_NOTIFICATIONS_PER_HOUR) return;
    notified.push(now());

    const admins = [...(parseEmailList(env.ADMIN_EMAILS) ?? [])];
    const appUrl = (env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
    const lines = [
      `${request.name || "Someone"} (${request.email}) registered interest in StockWatch.`,
      "",
      `See everyone waiting: ${appUrl}/users`,
    ];
    await Promise.all(
      admins.map((to) =>
        mailer
          .send({
            to,
            subject: `StockWatch: ${request.email} registered interest`,
            text: lines.join("\n"),
            html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(""),
          })
          .catch((err) => console.error("Interest notification failed:", err))
      )
    );
  }

  // Public: the welcome page asks for a token when it loads and sends it back with the form.
  router.get("/api/interest/token", (_req: Request, res: Response) => {
    res.set("Cache-Control", "no-store").json({ token: issueToken() });
  });

  // Public: the welcome page's form.
  router.post("/api/interest", async (req: Request, res: Response) => {
    if (rateLimited(req)) {
      res.status(429).json({ error: "Too many requests — try again later" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    // Looks like a bot: filled in the hidden field, or skipped loading the page, or was too quick. It's told
    // it worked, so it has no reason to try again differently, but nothing is saved.
    const honeypot = typeof body.website === "string" && body.website.trim() !== "";
    if (honeypot || !validToken(body.token)) {
      res.status(201).json({ ok: true });
      return;
    }
    // Signing up twice is fine: the first request stands, and nobody learns whether an email is already listed.
    const added = await execute("INSERT INTO interest_requests (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING", [
      email,
      name,
    ]);
    if (added) void notifyAdmins({ email, name });
    res.status(201).json({ ok: true });
  });

  router.get("/api/admin/interest", requireAdmin, async (_req: Request, res: Response) => {
    res.json({ requests: await listInterestRequests() });
  });

  // Once someone's been invited (or turned down), they can be cleared off the list.
  router.delete("/api/admin/interest/:email", requireAdmin, async (req: Request, res: Response) => {
    const removed = await execute("DELETE FROM interest_requests WHERE email = $1", [String(req.params.email).toLowerCase()]);
    if (!removed) {
      res.status(404).json({ error: "Not on the list" });
      return;
    }
    res.status(204).end();
  });

  return router;
}
