import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import db from "../db";
import { JWT_SECRET } from "../jwtSecret";

export interface AuthPayload {
  id: number;
  email: string;
  /** The user's token_version when this token was issued; absent on tokens from before it existed. */
  tv?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    // A password change bumps token_version, which signs out older sessions.
    const user = db.prepare("SELECT token_version FROM users WHERE id = ?").get(payload.id) as
      | { token_version: number }
      | undefined;
    if (!user || (payload.tv ?? 0) !== user.token_version) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
