import { Router, Request, Response } from "express";
import { execute, query, queryOne, transaction } from "./db";
import { createMailer, Mailer } from "./email";
import { serverAllowlist } from "./allowlist";
import { requireAdmin } from "./middleware/requireAuth";

/** Someone let in from the Users page who hasn't created an account yet. */
export interface PendingInvite {
  email: string;
  invitedAt: string;
}

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** People let in who haven't signed up yet, newest first. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const rows = await query<{ email: string; at: Date }>(
    `SELECT a.email, COALESCE(a.invited_at, a.created_at) AS at
     FROM allowed_emails a
     WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE lower(u.email) = a.email)
     ORDER BY at DESC, a.email`
  );
  return rows.map((r) => ({ email: r.email, invitedAt: r.at.toISOString() }));
}

export interface AccessRouterDeps {
  mailer?: Mailer;
  env?: NodeJS.ProcessEnv;
}

/**
 * Lets admins give people access (which emails them an invite) and take it
 * away again. ALLOWED_EMAILS on the server stays the permanent list; this adds
 * to it through the allowed_emails table.
 */
export function createAccessRouter({ mailer = createMailer(), env = process.env }: AccessRouterDeps = {}): Router {
  const router = Router();
  const appUrl = () => (env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");

  /** Tells them they're in. Returns false if the email couldn't be sent, so the admin can let them know another way. */
  async function sendInvite(email: string, hasAccount: boolean): Promise<boolean> {
    const link = hasAccount ? `${appUrl()}/login` : `${appUrl()}/login?register=1&email=${encodeURIComponent(email)}`;
    const lines = hasAccount
      ? ["Your access to StockWatch has been restored.", "", "Sign in here:", link]
      : [
          "Good news: you can now use StockWatch.",
          "",
          `Create your account with this email address (${email}) here:`,
          link,
          "",
          "StockWatch is an early, independent project, so if something looks wrong, just reply to let us know.",
        ];
    try {
      await mailer.send({
        to: email,
        subject: hasAccount ? "Your StockWatch access is back" : "You're invited to StockWatch",
        text: lines.join("\n"),
        html: lines
          .filter(Boolean)
          .map((l) => (l === link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` : `<p>${escapeHtml(l)}</p>`))
          .join(""),
      });
      return true;
    } catch (err) {
      console.error("Invite email failed:", err);
      return false;
    }
  }

  router.get("/api/admin/invites", requireAdmin, async (_req: Request, res: Response) => {
    res.json({ invites: await listPendingInvites() });
  });

  // Gives someone access: from the waiting list, a revoked user being restored, or a new email typed in.
  router.post("/api/admin/access", requireAdmin, async (req: Request, res: Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: "Enter a valid email address" });
      return;
    }
    const server = serverAllowlist(env);
    if (!server) {
      res.status(409).json({ error: "The site is open to everyone (ALLOWED_EMAILS isn't set), so there's nobody to let in" });
      return;
    }
    if (server.has(email)) {
      res.status(409).json({ error: "They already have access (set on the server)" });
      return;
    }
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO allowed_emails (email, added_by, invited_at) VALUES ($1, $2, now())
         ON CONFLICT (email) DO UPDATE SET invited_at = now()`,
        [email, req.user!.email]
      );
      await client.query("DELETE FROM interest_requests WHERE email = $1", [email]);
    });
    const hasAccount = (await queryOne(`SELECT 1 FROM "user" WHERE lower(email) = $1`, [email])) !== undefined;
    res.json({ emailed: await sendInvite(email, hasAccount) });
  });

  // Takes access away: signs them out everywhere and stops them signing in or signing up again.
  router.delete("/api/admin/access/:email", requireAdmin, async (req: Request, res: Response) => {
    const email = String(req.params.email).trim().toLowerCase();
    const server = serverAllowlist(env);
    if (!server) {
      res.status(409).json({ error: "The site is open to everyone (ALLOWED_EMAILS isn't set), so access can't be revoked" });
      return;
    }
    if (server.has(email)) {
      res.status(409).json({ error: "Their access is set on the server (ALLOWED_EMAILS), so it can't be revoked here" });
      return;
    }
    if (email === req.user!.email.toLowerCase()) {
      res.status(409).json({ error: "You can't revoke your own access" });
      return;
    }
    const removed = await execute("DELETE FROM allowed_emails WHERE email = $1", [email]);
    const signedOut = await execute(`DELETE FROM session WHERE "userId" IN (SELECT id FROM "user" WHERE lower(email) = $1)`, [email]);
    if (!removed && !signedOut) {
      res.status(404).json({ error: "They don't have access" });
      return;
    }
    res.status(204).end();
  });

  return router;
}
