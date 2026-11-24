import { createAuthClient } from "better-auth/vue";

/** Better Auth's client for the server's /api/auth routes. Sessions live in an httpOnly cookie. */
export const authClient = createAuthClient();

export type SocialProvider = "google" | "github";

export const PROVIDER_LABELS: Record<SocialProvider, string> = { google: "Google", github: "GitHub" };

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** Admins can remove tickers and ETFs and see the Users page. */
  isAdmin: boolean;
}

let sessionUser: Promise<SessionUser | null> | null = null;

/**
 * The signed-in user, or null. Fetched once and then cached, so route
 * changes don't each ask the server; call `clearSessionCache` after
 * signing in or out. A failed lookup isn't cached.
 */
export function getSessionUser(): Promise<SessionUser | null> {
  sessionUser ??= fetch("/api/me", { credentials: "same-origin" })
    .then(async (res) => {
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`Session lookup failed (${res.status})`);
      const { id, email, name, isAdmin } = (await res.json()) as SessionUser;
      return { id, email, name, isAdmin: isAdmin === true };
    })
    .catch(() => {
      sessionUser = null;
      return null;
    });
  return sessionUser;
}

export function clearSessionCache(): void {
  sessionUser = null;
}

export interface AuthConfig {
  /** The social sign-in providers the server has credentials for. */
  providers: SocialProvider[];
  /** Only invited emails can sign up; everyone else is pointed at the waiting list. */
  inviteOnly: boolean;
}

let authConfig: Promise<AuthConfig> | null = null;

/** How sign-in is set up on the server. */
export function fetchAuthConfig(): Promise<AuthConfig> {
  authConfig ??= fetch("/api/auth-providers", { credentials: "same-origin" })
    .then((res) => (res.ok ? res.json() : {}))
    .then((body: Partial<AuthConfig>) => ({ providers: body.providers ?? [], inviteOnly: body.inviteOnly === true }))
    .catch(() => {
      authConfig = null;
      return { providers: [], inviteOnly: false };
    });
  return authConfig;
}

/** The social sign-in providers the server has credentials for. */
export async function fetchAuthProviders(): Promise<SocialProvider[]> {
  return (await fetchAuthConfig()).providers;
}

/** Better Auth's error for a failed call, as a message to show. */
export function authErrorMessage(error: { message?: string; statusText?: string } | null, fallback: string): string {
  return error?.message || error?.statusText || fallback;
}

/** A readable message for the `?error=` code an OAuth sign-in redirects back with. */
export function oauthErrorMessage(code: string): string {
  const text = code.replace(/_/g, " ").toLowerCase();
  if (text.includes("invite") || text.includes("allowlist") || text.includes("signup disabled")) {
    return "This email isn't on the invite list.";
  }
  if (text.includes("access denied")) return "Sign-in was cancelled.";
  // From an email verification link.
  if (text.includes("invalid token") || text.includes("token expired")) {
    return "That verification link is invalid or has expired.\nLog in to be sent a new one.";
  }
  if (text.includes("account not linked")) {
    return "That email already has an account.\nLog in with your password, then connect this provider from the Account page.";
  }
  if (text.includes("email not found")) return "That account didn't share an email address, which is needed to sign in.";
  return "Sign-in didn't complete — try again.";
}
