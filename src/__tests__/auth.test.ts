import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { createAuthOptions, parseAllowlist } from "../auth";
import { requireAuth } from "../middleware/requireAuth";
import { queryOne } from "../db";
import type { EmailMessage, Mailer } from "../email";

const sent: EmailMessage[] = [];
const mailer: Mailer = { configured: true, send: vi.fn(async (m: EmailMessage) => void sent.push(m)) };
const env = { ...process.env, ALLOWED_EMAILS: "Invited@Example.com, second@example.com, revoked@example.com" };
const options = createAuthOptions({ mailer, env });
const auth = betterAuth(options);

const app = express();
app.all("/api/auth/{*path}", toNodeHandler(auth));
app.use(express.json());
app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.user);
});

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
/** The app's own origin: Better Auth rejects cookie-carrying requests from any other. */
const ORIGIN = new URL(options.baseURL).origin;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== "string") baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

const me = (cookie?: string) => fetch(`${baseUrl}/api/me`, { headers: cookie ? { Cookie: cookie } : {} });

/** The session cookie a response set, ready to send back as a Cookie header. */
function sessionCookie(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.includes("session_token="));
  expect(cookie).toBeDefined();
  return cookie!.split(";")[0];
}

/** Follows the link in the last email sent to `to`, against the test server. */
function followEmailLink(to: string) {
  const mail = sent.filter((m) => m.to === to).at(-1)!;
  const link = new URL(mail.text.match(/https?:\/\/\S+/)![0]);
  return fetch(`${baseUrl}${link.pathname}${link.search}`, { redirect: "manual" });
}

async function signUpVerified(email: string, password = "original-pass") {
  expect((await post("/api/auth/sign-up/email", { email, password, name: "Test" })).status).toBe(200);
  expect((await followEmailLink(email)).status).toBe(302);
}

describe("parseAllowlist", () => {
  it("normalises case and spacing, and treats an empty list as no restriction", () => {
    expect(parseAllowlist(" A@x.com,b@X.com ,")).toEqual(new Set(["a@x.com", "b@x.com"]));
    expect(parseAllowlist("")).toBeNull();
    expect(parseAllowlist(undefined)).toBeNull();
  });
});

describe("sign-up", () => {
  it("refuses emails that aren't on the invite list without saying so", async () => {
    // The response matches a real sign-up's, so it can't be used to find out who's invited.
    const res = await post("/api/auth/sign-up/email", { email: "stranger@example.com", password: "password1", name: "S" });
    expect(res.status).toBe(200);
    expect(sent.some((m) => m.to === "stranger@example.com")).toBe(false);
    const stranger = await queryOne(`SELECT 1 FROM "user" WHERE email = 'stranger@example.com'`);
    expect(stranger).toBeUndefined();
  });

  it("requires the email to be verified before signing in, then signs in from the link", async () => {
    const signUp = await post("/api/auth/sign-up/email", { email: "invited@example.com", password: "password1", name: "I" });
    expect(signUp.status).toBe(200);
    expect(signUp.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    expect(sent.at(-1)).toMatchObject({ to: "invited@example.com", subject: "Verify your StockWatch email" });

    const early = await post("/api/auth/sign-in/email", { email: "invited@example.com", password: "password1" });
    expect(early.status).toBe(403);
    expect((await early.json()).code).toBe("EMAIL_NOT_VERIFIED");

    const verified = await followEmailLink("invited@example.com");
    expect(verified.status).toBe(302);
    const res = await me(sessionCookie(verified));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: "invited@example.com" });
  });
});

describe("sessions", () => {
  it("signs in with an httpOnly cookie and signs out", async () => {
    await signUpVerified("second@example.com");
    expect((await post("/api/auth/sign-in/email", { email: "second@example.com", password: "wrong-pass" })).status).toBe(401);

    const signIn = await post("/api/auth/sign-in/email", { email: "second@example.com", password: "original-pass" });
    expect(signIn.status).toBe(200);
    const setCookie = signIn.headers.getSetCookie().find((c) => c.includes("session_token="))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = sessionCookie(signIn);
    expect((await me(cookie)).status).toBe(200);

    expect((await post("/api/auth/sign-out", {}, cookie)).status).toBe(200);
    expect((await me(cookie)).status).toBe(401);
  });

  it("rejects requests without a session", async () => {
    expect((await me()).status).toBe(401);
    expect((await me("better-auth.session_token=forged.value")).status).toBe(401);
  });

  it("resetting the password signs out every session", async () => {
    const signIn = await post("/api/auth/sign-in/email", { email: "second@example.com", password: "original-pass" });
    const cookie = sessionCookie(signIn);

    expect((await post("/api/auth/request-password-reset", { email: "second@example.com", redirectTo: "/reset-password" })).status).toBe(200);
    const link = await followEmailLink("second@example.com");
    const token = new URL(link.headers.get("location")!, ORIGIN).searchParams.get("token")!;
    expect(token).toBeTruthy();

    expect((await post("/api/auth/reset-password", { token, newPassword: "brand-new-pass" })).status).toBe(200);
    expect((await me(cookie)).status).toBe(401);
    expect((await post("/api/auth/sign-in/email", { email: "second@example.com", password: "original-pass" })).status).toBe(401);
    expect((await post("/api/auth/sign-in/email", { email: "second@example.com", password: "brand-new-pass" })).status).toBe(200);
    // The link works once.
    expect((await post("/api/auth/reset-password", { token, newPassword: "another-pass" })).status).toBe(400);
  });

  it("stops signing in someone who's been taken off the invite list", async () => {
    await signUpVerified("revoked@example.com");
    const revokedAuth = betterAuth(
      createAuthOptions({ mailer, env: { ...env, ALLOWED_EMAILS: "invited@example.com" } })
    );
    const res = await revokedAuth.api.signInEmail({
      body: { email: "revoked@example.com", password: "original-pass" },
      asResponse: true,
    });
    expect(res.status).toBe(403);
  });
});
