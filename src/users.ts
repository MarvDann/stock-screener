import { Router, Request, Response } from "express";
import { query } from "./db";
import { serverAllowlist } from "./allowlist";
import { isAdminEmail, requireAdmin, requireAuth } from "./middleware/requireAuth";

/**
 * "server": always allowed (ALLOWED_EMAILS, or everyone when it's unset), so it can't be revoked here.
 * "allowed": let in by an admin. "revoked": an account whose access was taken away.
 */
export type Access = "server" | "allowed" | "revoked";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  access: Access;
  /** How they sign in: "credential" (email and password), "google", "github". */
  signInMethods: string[];
  createdAt: string;
  /** When they last used the site, from their most recent session; null if never signed in. */
  lastActiveAt: string | null;
}

/** Every account, newest first. */
export async function listUsers(): Promise<UserSummary[]> {
  const server = serverAllowlist();
  const rows = await query<
    Omit<UserSummary, "isAdmin" | "access" | "createdAt" | "lastActiveAt"> & {
      createdAt: Date;
      lastActiveAt: Date | null;
      letIn: boolean;
    }
  >(
    `SELECT u.id, u.name, u.email, u."emailVerified",
            COALESCE((SELECT array_agg(DISTINCT a."providerId" ORDER BY a."providerId") FROM account a WHERE a."userId" = u.id), '{}') AS "signInMethods",
            u."createdAt",
            (SELECT max(s."updatedAt") FROM session s WHERE s."userId" = u.id) AS "lastActiveAt",
            EXISTS (SELECT 1 FROM allowed_emails a WHERE a.email = lower(u.email)) AS "letIn"
     FROM "user" u
     ORDER BY u."createdAt" DESC, u.email`
  );
  return rows.map(({ letIn, ...r }) => ({
    ...r,
    isAdmin: isAdminEmail(r.email),
    access: !server || server.has(r.email.toLowerCase()) ? "server" : letIn ? "allowed" : "revoked",
    createdAt: r.createdAt.toISOString(),
    lastActiveAt: r.lastActiveAt?.toISOString() ?? null,
  }));
}

export function createUsersRouter(): Router {
  const router = Router();

  // Who's signed in, including whether they're an admin (the client hides admin-only controls otherwise).
  router.get("/api/me", requireAuth, (req: Request, res: Response) => {
    res.json(req.user);
  });

  router.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response) => {
    res.json({ users: await listUsers() });
  });

  return router;
}
