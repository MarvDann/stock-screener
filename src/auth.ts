import { Router } from "express";
import { betterAuth, BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { pool, queryOne } from "./db";
import { createMailer, Mailer } from "./email";

const APP_URL = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
const NOT_INVITED = "This email isn't on the invite list";

/** Only these emails (comma-separated in ALLOWED_EMAILS, any case) can sign up or sign in. Unset allows everyone. */
export function parseAllowlist(raw = process.env.ALLOWED_EMAILS): Set<string> | null {
  const emails = (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.length > 0 ? new Set(emails) : null;
}

/** The social logins with credentials configured, in the order the login page shows them. */
function socialProviders(env: NodeJS.ProcessEnv): NonNullable<BetterAuthOptions["socialProviders"]> {
  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }
  return providers;
}

function linkEmail(action: string, url: string) {
  return {
    text: [`${action}:`, url, "", "If this wasn't you, you can ignore this email."].join("\n"),
    html: `<p><a href="${url}">${action}</a></p><p>If this wasn't you, you can ignore this email.</p>`,
  };
}

export interface AuthOptionsDeps {
  mailer?: Mailer;
  env?: NodeJS.ProcessEnv;
}

/**
 * Better Auth's configuration: email/password (verified by email before the
 * first sign-in) plus Google and GitHub when configured, with sessions in
 * httpOnly cookies backed by the `session` table.
 */
export function createAuthOptions({ mailer = createMailer(), env = process.env }: AuthOptionsDeps = {}) {
  const allowlist = parseAllowlist(env.ALLOWED_EMAILS);
  const isAllowed = (email: string) => !allowlist || allowlist.has(email.toLowerCase());

  return {
    appName: "StockWatch",
    baseURL: APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET ?? (env.NODE_ENV === "production" ? undefined : "dev-secret-change-me-dev-secret"),
    database: pool,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Proves the address is theirs, so nobody can claim an invited email first.
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await mailer.send({
          to: user.email,
          subject: "Reset your StockWatch password",
          ...linkEmail("Choose a new password (the link works once, for the next hour)", url),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await mailer.send({
          to: user.email,
          subject: "Verify your StockWatch email",
          ...linkEmail("Verify your email address", url),
        });
      },
    },
    socialProviders: socialProviders(env),
    account: {
      // Signing in with Google or GitHub under an existing account's verified email links to that account.
      accountLinking: { enabled: true, trustedProviders: ["google", "github"] },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      // Each day of use pushes expiry back, so active users stay signed in.
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: env.NODE_ENV === "production", window: 60, max: 100 },
    advanced: {
      // nginx sets X-Real-IP to the connecting address, replacing anything the client sent.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    onAPIError: { errorURL: `${APP_URL}/login` },
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            if (!isAllowed(user.email)) throw new APIError("FORBIDDEN", { code: "not_invited", message: NOT_INVITED });
          },
        },
      },
      session: {
        create: {
          // Also checked at sign-in, so removing someone from the list locks them out.
          async before(session) {
            const user = await queryOne<{ email: string }>(`SELECT email FROM "user" WHERE id = $1`, [session.userId]);
            if (!user || !isAllowed(user.email)) throw new APIError("FORBIDDEN", { code: "not_invited", message: NOT_INVITED });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export const authOptions = createAuthOptions();
export const auth = betterAuth(authOptions);

/** Tells the login page which social sign-in buttons to show. */
export const authProvidersRouter = Router().get("/api/auth-providers", (_req, res) => {
  res.json({ providers: Object.keys(authOptions.socialProviders) });
});
