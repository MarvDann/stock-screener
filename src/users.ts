import { Router, Request, Response } from "express";
import { query } from "./db";
import { isAdminEmail, requireAdmin, requireAuth } from "./middleware/requireAuth";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  /** How they sign in: "credential" (email and password), "google", "github". */
  signInMethods: string[];
  createdAt: string;
  /** When they last used the site, from their most recent session; null if never signed in. */
  lastActiveAt: string | null;
}

/** Every account, newest first. */
export async function listUsers(): Promise<UserSummary[]> {
  const rows = await query<Omit<UserSummary, "isAdmin" | "createdAt" | "lastActiveAt"> & { createdAt: Date; lastActiveAt: Date | null }>(
    `SELECT u.id, u.name, u.email, u."emailVerified",
            COALESCE((SELECT array_agg(DISTINCT a."providerId" ORDER BY a."providerId") FROM account a WHERE a."userId" = u.id), '{}') AS "signInMethods",
            u."createdAt",
            (SELECT max(s."updatedAt") FROM session s WHERE s."userId" = u.id) AS "lastActiveAt"
     FROM "user" u
     ORDER BY u."createdAt" DESC, u.email`
  );
  return rows.map((r) => ({
    ...r,
    isAdmin: isAdminEmail(r.email),
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
