import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, parseEmailList } from "../auth";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** Admins (ADMIN_EMAILS) can remove tickers and ETFs and see the list of users. */
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Whether this email is on ADMIN_EMAILS (comma-separated, any case). Read per call, so an env change applies on reload. */
export function isAdminEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return parseEmailList(env.ADMIN_EMAILS)?.has(email.toLowerCase()) ?? false;
}

/** Rejects requests without a live session cookie; sets req.user for the rest. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const { id, email, name } = session.user;
    req.user = { id, email, name, isAdmin: isAdminEmail(email) };
    next();
  } catch (err) {
    next(err);
  }
}

/** Checks the session like requireAuth, then turns away anyone who isn't an admin. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.user!.isAdmin) {
      res.status(403).json({ error: "Only an admin can do that" });
      return;
    }
    next();
  });
}
