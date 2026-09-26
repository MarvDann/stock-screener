import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import { createAuthRouter } from "../auth";
import type { EmailMessage, Mailer } from "../email";

const sent: EmailMessage[] = [];
const mailer: Mailer = { configured: true, send: vi.fn(async (m: EmailMessage) => void sent.push(m)) };
let now = 1_000_000_000;

const app = express();
app.use(express.json());
app.use(createAuthRouter({ mailer, appUrl: "https://screener.test/", now: () => now }));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

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

function post(path: string, body: unknown, token?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function register(email: string, password = "original-pass") {
  const res = await post("/api/auth/register", { email, password });
  return ((await res.json()) as { token: string }).token;
}

/** Requests a reset for `email` and returns the token from the emailed link. */
async function requestReset(email: string) {
  const before = sent.length;
  const res = await post("/api/auth/forgot-password", { email });
  expect(res.status).toBe(200);
  const mail = sent[before];
  return mail ? new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get("token")! : null;
}

const login = (email: string, password: string) => post("/api/auth/login", { email, password });
const me = (token: string) => post("/api/auth/change-password", {}, token); // 400 when authed, 401 when not

let counter = 0;
const freshEmail = () => `reset-${++counter}-${Date.now()}@example.com`;

beforeEach(() => {
  now += 60 * 60 * 1000; // step past every rate limit and cooldown
});

describe("password reset", () => {
  it("emails a one-time link that sets a new password", async () => {
    const email = freshEmail();
    await register(email);

    const token = await requestReset(email);
    const mail = sent.at(-1)!;
    expect(mail.to).toBe(email);
    expect(mail.subject).toBe("Reset your Stock Screener password");
    expect(mail.text).toContain("https://screener.test/reset-password?token=");
    expect(mail.html).toContain("https://screener.test/reset-password?token=");

    const res = await post("/api/auth/reset-password", { token, password: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { token: string }).token).toBeTruthy();

    expect((await login(email, "brand-new-pass")).status).toBe(200);
    expect((await login(email, "original-pass")).status).toBe(401);
  });

  it("gives the same answer for unknown emails, and sends nothing", async () => {
    const before = sent.length;
    const res = await post("/api/auth/forgot-password", { email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "If an account exists for that email, we've sent a link to reset its password." });
    expect(sent.length).toBe(before);
  });

  it("only works once", async () => {
    const email = freshEmail();
    await register(email);
    const token = await requestReset(email);

    expect((await post("/api/auth/reset-password", { token, password: "first-new-pass" })).status).toBe(200);
    const again = await post("/api/auth/reset-password", { token, password: "second-new-pass" });
    expect(again.status).toBe(400);
    expect(((await again.json()) as { error: string }).error).toContain("invalid or has expired");
  });

  it("expires after an hour", async () => {
    const email = freshEmail();
    await register(email);
    const token = await requestReset(email);

    now += 60 * 60 * 1000 + 1;
    expect((await post("/api/auth/reset-password", { token, password: "too-late-pass" })).status).toBe(400);
  });

  it("replaces earlier links when a new one is requested", async () => {
    const email = freshEmail();
    await register(email);
    const first = await requestReset(email);
    now += 2 * 60 * 1000;
    const second = await requestReset(email);

    expect((await post("/api/auth/reset-password", { token: first, password: "from-old-link" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: second, password: "from-new-link" })).status).toBe(200);
  });

  it("doesn't send a second email within a minute of the first", async () => {
    const email = freshEmail();
    await register(email);
    expect(await requestReset(email)).not.toBeNull();
    expect(await requestReset(email)).toBeNull();
  });

  it("rate-limits requests from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post("/api/auth/forgot-password", { email: `x${i}@example.com` })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("signs out sessions from before the reset", async () => {
    const email = freshEmail();
    const oldSession = await register(email);
    expect((await me(oldSession)).status).toBe(400);

    const token = await requestReset(email);
    const res = await post("/api/auth/reset-password", { token, password: "fresh-password" });
    const newSession = ((await res.json()) as { token: string }).token;

    expect((await me(oldSession)).status).toBe(401);
    expect((await me(newSession)).status).toBe(400);
  });

  it("rejects short passwords and missing tokens", async () => {
    expect((await post("/api/auth/reset-password", { token: "x", password: "short" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { password: "long-enough-pass" })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: "not-a-real-token", password: "long-enough-pass" })).status).toBe(400);
  });

  it("still answers normally if the email fails to send", async () => {
    const email = freshEmail();
    await register(email);
    vi.mocked(mailer.send).mockRejectedValueOnce(new Error("provider down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("/api/auth/forgot-password", { email });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("change password", () => {
  it("changes the password when the current one is right, and signs out other sessions", async () => {
    const email = freshEmail();
    const session = await register(email);

    const wrong = await post("/api/auth/change-password", { currentPassword: "nope-nope", newPassword: "changed-pass" }, session);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: "Current password is incorrect" });

    const res = await post("/api/auth/change-password", { currentPassword: "original-pass", newPassword: "changed-pass" }, session);
    expect(res.status).toBe(200);
    const newSession = ((await res.json()) as { token: string }).token;

    expect((await login(email, "changed-pass")).status).toBe(200);
    expect((await me(session)).status).toBe(401);
    expect((await me(newSession)).status).toBe(400);
  });

  it("requires a login", async () => {
    expect((await post("/api/auth/change-password", { currentPassword: "a", newPassword: "bbbbbbbb" })).status).toBe(401);
  });

  it("rejects a short new password", async () => {
    const session = await register(freshEmail());
    const res = await post("/api/auth/change-password", { currentPassword: "original-pass", newPassword: "short" }, session);
    expect(res.status).toBe(400);
  });
});
