import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth";

export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Rejects requests without a live session cookie; sets req.user for the rest. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.user = { id: session.user.id, email: session.user.email };
    next();
  } catch (err) {
    next(err);
  }
}
