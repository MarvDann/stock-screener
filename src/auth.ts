import { Router } from "express";
import { betterAuth, BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { pool, queryOne } from "./db";
import { createMailer, Mailer, renderEmail } from "./email";
import { isEmailAllowed, parseEmailList, serverAllowlist } from "./allowlist";

export { parseEmailList };

const APP_URL = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
const NOT_INVITED = "This email isn't on the invite list";

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
  // Only emails on ALLOWED_EMAILS or let in from the Users page can sign up or sign in. Unset allows everyone.
  const isAllowed = (email: string) => isEmailAllowed(email, env);

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
          ...renderEmail({
            paragraphs: ["Someone, hopefully you, asked to reset the password for your StockWatch account."],
            button: { label: "Choose a new password", url },
            after: ["The link works once, for the next hour."],
            reason: "If you didn't ask for this, you can ignore this email and your password won't change.",
          }),
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
          ...renderEmail({
            paragraphs: ["Thanks for signing up to StockWatch.", "Please confirm this is your email address to finish setting up your account."],
            button: { label: "Verify my email", url },
            reason: "If you didn't sign up for StockWatch, you can ignore this email.",
          }),
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
            if (!(await isAllowed(user.email))) throw new APIError("FORBIDDEN", { code: "not_invited", message: NOT_INVITED });
          },
        },
      },
      session: {
        create: {
          // Also checked at sign-in, so revoking someone's access locks them out.
          async before(session) {
            const user = await queryOne<{ email: string }>(`SELECT email FROM "user" WHERE id = $1`, [session.userId]);
            if (!user || !(await isAllowed(user.email))) throw new APIError("FORBIDDEN", { code: "not_invited", message: NOT_INVITED });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export const authOptions = createAuthOptions();
export const auth = betterAuth(authOptions);

/**
 * Tells the login page which social sign-in buttons to show, and whether
 * sign-up is invite-only (it then points people to the waiting list instead).
 */
export const authProvidersRouter = Router().get("/api/auth-providers", (_req, res) => {
  res.json({ providers: Object.keys(authOptions.socialProviders), inviteOnly: serverAllowlist() !== null });
});
