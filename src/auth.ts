import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import db from "./db";
import { createMailer, Mailer } from "./email";
import { requireAuth } from "./middleware/requireAuth";
import { JWT_SECRET } from "./jwtSecret";

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";
const MIN_PASSWORD_LENGTH = 8;

/** How long a password reset link works for. */
const RESET_TTL_MS = 60 * 60 * 1000;
/** A second reset email for the same account within this window is skipped. */
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
/** Reset requests allowed per IP address per window. */
const RESET_REQUESTS_PER_WINDOW = 5;
const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  token_version: number;
}

/** Tokens carry the user's token_version as `tv`; bumping it signs out every earlier session. */
function signToken(user: { id: number; email: string; token_version: number }): string {
  return jwt.sign({ id: user.id, email: user.email, tv: user.token_version }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

/** Stores a new password and signs out every existing session; returns the user's new token. */
function setPassword(user: UserRow, hash: string): string {
  const tokenVersion = user.token_version + 1;
  db.prepare("UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?").run(hash, tokenVersion, user.id);
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
  return signToken({ ...user, token_version: tokenVersion });
}

function resetEmail(resetUrl: string) {
  const text = [
    "Someone asked to reset the password for your Stock Screener account.",
    "",
    `Choose a new password here (the link works once, for the next hour):`,
    resetUrl,
    "",
    "If this wasn't you, you can ignore this email — your password won't change.",
  ].join("\n");
  const html = `
    <p>Someone asked to reset the password for your Stock Screener account.</p>
    <p><a href="${resetUrl}">Choose a new password</a> — the link works once, for the next hour.</p>
    <p>If this wasn't you, you can ignore this email; your password won't change.</p>`;
  return { subject: "Reset your Stock Screener password", text, html };
}

export interface AuthRouterOptions {
  mailer?: Mailer;
  /** Where the client app is served, for building reset links. */
  appUrl?: string;
  now?: () => number;
}

export function createAuthRouter({
  mailer = createMailer(),
  appUrl = process.env.APP_URL ?? "http://localhost:5173",
  now = () => Date.now(),
}: AuthRouterOptions = {}): Router {
  const router = Router();
  const resetRequestsByIp = new Map<string, number[]>();

  router.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (!isValidPassword(password)) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    try {
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }

      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      const result = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);

      const token = signToken({ id: result.lastInsertRowid as number, email, token_version: 0 });
      res.status(201).json({ token });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  router.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;

      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      res.json({ token: signToken(user) });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  /**
   * Emails a one-time reset link. Always answers the same way whether or not
   * the email has an account, so it can't be used to discover who's registered.
   */
  router.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const email = req.body?.email;
    if (typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const ip = req.ip ?? "unknown";
    const recent = (resetRequestsByIp.get(ip) ?? []).filter((t) => now() - t < RESET_REQUEST_WINDOW_MS);
    if (recent.length >= RESET_REQUESTS_PER_WINDOW) {
      res.status(429).json({ error: "Too many reset requests — try again in a few minutes" });
      return;
    }
    resetRequestsByIp.set(ip, [...recent, now()]);

    const sent = { message: "If an account exists for that email, we've sent a link to reset its password." };
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as UserRow | undefined;
    if (!user) {
      res.json(sent);
      return;
    }

    const latest = db
      .prepare("SELECT MAX(created_at) AS created_at FROM password_resets WHERE user_id = ?")
      .get(user.id) as { created_at: number | null };
    if (latest.created_at !== null && now() - latest.created_at < RESET_RESEND_COOLDOWN_MS) {
      res.json(sent);
      return;
    }

    // A new link replaces any earlier ones.
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
    db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
      hashResetToken(token),
      user.id,
      now() + RESET_TTL_MS,
      now()
    );

    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
    try {
      await mailer.send({ to: user.email, ...resetEmail(resetUrl) });
    } catch (err) {
      // Logged rather than reported, so the response still can't reveal whether the account exists.
      console.error("Password reset email failed:", err);
    }
    res.json(sent);
  });

  router.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== "string" || !token) {
      res.status(400).json({ error: "Reset token is required" });
      return;
    }
    if (!isValidPassword(password)) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    try {
      const reset = db
        .prepare("SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?")
        .get(hashResetToken(token)) as { user_id: number; expires_at: number } | undefined;
      if (!reset || reset.expires_at < now()) {
        res.status(400).json({ error: "This reset link is invalid or has expired — request a new one" });
        return;
      }
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(reset.user_id) as UserRow;
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      res.json({ token: setPassword(user, hash) });
    } catch (err) {
      console.error("Password reset error:", err);
      res.status(500).json({ error: "Password reset failed" });
    }
  });

  router.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || !currentPassword) {
      res.status(400).json({ error: "Current password is required" });
      return;
    }
    if (!isValidPassword(newPassword)) {
      res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as UserRow | undefined;
      // 400, not 401: clients treat a 401 as "session expired" and log out.
      if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }
      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      res.json({ token: setPassword(user, hash) });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Changing password failed" });
    }
  });

  return router;
}

export default createAuthRouter();
export { JWT_SECRET };
