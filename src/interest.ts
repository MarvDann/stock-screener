import { Router, Request, Response } from "express";
import { execute, query } from "./db";
import { createMailer, Mailer } from "./email";
import { parseEmailList } from "./auth";
import { requireAdmin } from "./middleware/requireAuth";

export interface InterestRequest {
  email: string;
  name: string;
  note: string;
  createdAt: string;
}

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MAX_NOTE_LENGTH = 1000;
// Loose on purpose: a typo only costs the admin a bounced invite.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Each address (nginx's X-Real-IP) can send this many requests per window. */
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function listInterestRequests(): Promise<InterestRequest[]> {
  const rows = await query<{ email: string; name: string; note: string; created_at: Date }>(
    "SELECT email, name, note, created_at FROM interest_requests ORDER BY created_at DESC, email"
  );
  return rows.map((r) => ({ email: r.email, name: r.name, note: r.note, createdAt: r.created_at.toISOString() }));
}

export interface InterestRouterDeps {
  mailer?: Mailer;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export function createInterestRouter({ mailer = createMailer(), env = process.env, now = Date.now }: InterestRouterDeps = {}): Router {
  const router = Router();
  const hits = new Map<string, number[]>();

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
    const admins = [...(parseEmailList(env.ADMIN_EMAILS) ?? [])];
    const appUrl = (env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
    const lines = [
      `${request.name || "Someone"} (${request.email}) registered interest in StockWatch.`,
      ...(request.note ? ["", `"${request.note}"`] : []),
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

  // Public: the welcome page's form.
  router.post("/api/interest", async (req: Request, res: Response) => {
    if (rateLimited(req)) {
      res.status(429).json({ error: "Too many requests — try again later" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : "";
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    // Signing up twice is fine: the first request stands, and nobody learns whether an email is already listed.
    const added = await execute(
      "INSERT INTO interest_requests (email, name, note) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
      [email, name, note]
    );
    if (added) void notifyAdmins({ email, name, note });
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
