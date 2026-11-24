import { queryOne } from "./db";

/**
 * A comma-separated list of emails (ALLOWED_EMAILS, ADMIN_EMAILS), lowercased;
 * null when empty or unset.
 */
export function parseEmailList(raw: string | undefined): Set<string> | null {
  const emails = (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.length > 0 ? new Set(emails) : null;
}

/**
 * The emails always allowed in, from ALLOWED_EMAILS on the server (the owners;
 * they can't be revoked from the site, so nobody can lock themselves out).
 * Null when it's unset, which means the site is open to everyone.
 */
export function serverAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> | null {
  return parseEmailList(env.ALLOWED_EMAILS);
}

/** Whether this email may sign up and sign in: on the server's list, or let in by an admin (allowed_emails). */
export async function isEmailAllowed(email: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const server = serverAllowlist(env);
  if (!server) return true;
  const normalized = email.trim().toLowerCase();
  if (server.has(normalized)) return true;
  return (await queryOne("SELECT 1 FROM allowed_emails WHERE email = $1", [normalized])) !== undefined;
}
