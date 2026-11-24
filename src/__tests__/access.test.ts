import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createTestUser } from "./helpers";
import { createAccessRouter } from "../access";
import { isEmailAllowed } from "../allowlist";
import { execute, queryOne } from "../db";
import type { EmailMessage, Mailer } from "../email";

const env = { ALLOWED_EMAILS: "admin@example.com,owner@example.com", APP_URL: "https://stockwatch.test" };
const sent: EmailMessage[] = [];
let failNextEmail = false;
const mailer: Mailer = {
  configured: true,
  send: vi.fn(async (m: EmailMessage) => {
    if (failNextEmail) {
      failNextEmail = false;
      throw new Error("Resend is down");
    }
    sent.push(m);
  }),
};

const app = express();
app.use(express.json());
app.use(createAccessRouter({ mailer, env }));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
// ADMIN_EMAILS is admin@example.com (vitest.config.ts).
const admin = await createTestUser("admin@example.com");
const member = await createTestUser("member@example.com");

const allow = (email: string, cookie = admin.cookie) =>
  fetch(`${baseUrl}/api/admin/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ email }),
  });
const revoke = (email: string, cookie = admin.cookie) =>
  fetch(`${baseUrl}/api/admin/access/${encodeURIComponent(email)}`, { method: "DELETE", headers: { Cookie: cookie } });
const invites = async () =>
  (await (await fetch(`${baseUrl}/api/admin/invites`, { headers: { Cookie: admin.cookie } })).json()).invites as { email: string }[];

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

describe("admin access endpoints", () => {
  it("are for admins only", async () => {
    expect((await allow("x@example.com", "")).status).toBe(401);
    expect((await allow("x@example.com", member.cookie)).status).toBe(403);
    expect((await revoke("x@example.com", member.cookie)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/admin/invites`, { headers: { Cookie: member.cookie } })).status).toBe(403);
  });

  it("lets someone in from the waiting list and emails them a sign-up link", async () => {
    await execute("INSERT INTO interest_requests (email, name) VALUES ('jane@example.com', 'Jane')");
    expect(await isEmailAllowed("jane@example.com", env)).toBe(false);

    const res = await allow(" Jane@Example.com ");
    expect(await res.json()).toEqual({ emailed: true });
    expect(await isEmailAllowed("JANE@example.com", env)).toBe(true);
    expect(await queryOne("SELECT 1 FROM interest_requests WHERE email = 'jane@example.com'")).toBeUndefined();
    expect(await invites()).toEqual([expect.objectContaining({ email: "jane@example.com" })]);

    const invite = sent.at(-1)!;
    expect(invite).toMatchObject({ to: "jane@example.com", subject: "Your StockWatch invite" });
    expect(invite.text).toContain("Hi Jane,");
    expect(invite.text).toContain("Thanks for joining the StockWatch waiting list.");
    expect(invite.text).toContain("https://stockwatch.test/login?register=1&email=jane%40example.com");
    expect(invite.html).toContain('href="https://stockwatch.test/login?register=1&amp;email=jane%40example.com"');
    expect(invite.html).toContain(">Create your account</a>");
  });

  it("says when the invite email couldn't be sent, but still lets them in", async () => {
    failNextEmail = true;
    expect(await (await allow("bob@example.com")).json()).toEqual({ emailed: false });
    // Not from the waiting list, so it's a plain invite.
    expect((await allow("bob@example.com")).status).toBe(200);
    expect(sent.at(-1)!.text).toContain("You've been invited to StockWatch");
    expect(sent.at(-1)!.text).toContain("Hi,");
    expect(await isEmailAllowed("bob@example.com", env)).toBe(true);
  });

  it("revokes access: signs them out and stops them coming back", async () => {
    const jane = await createTestUser("jane@example.com");
    expect(await invites()).not.toContainEqual(expect.objectContaining({ email: "jane@example.com" }));
    expect(await queryOne(`SELECT 1 FROM session WHERE "userId" = $1`, [jane.id])).toBeDefined();

    expect((await revoke("jane@example.com")).status).toBe(204);
    expect(await isEmailAllowed("jane@example.com", env)).toBe(false);
    expect(await queryOne(`SELECT 1 FROM session WHERE "userId" = $1`, [jane.id])).toBeUndefined();
    expect((await revoke("jane@example.com")).status).toBe(404);
  });

  it("restores a revoked user with a sign-in link rather than a sign-up one", async () => {
    expect(await (await allow("jane@example.com")).json()).toEqual({ emailed: true });
    expect(sent.at(-1)).toMatchObject({ to: "jane@example.com", subject: "Your StockWatch access is back" });
    expect(sent.at(-1)!.text.split("\n")).toContain("https://stockwatch.test/login");
  });

  it("won't touch people on the server's list, or let an admin revoke themselves", async () => {
    expect((await allow("owner@example.com")).status).toBe(409);
    expect((await revoke("owner@example.com")).status).toBe(409);
    expect((await revoke("admin@example.com")).status).toBe(409);
  });

  it("rejects an invalid email", async () => {
    expect((await allow("nope")).status).toBe(400);
  });
});

describe("open site (no ALLOWED_EMAILS)", () => {
  it("allows everyone, so there's nothing to let in or revoke", async () => {
    const open = express().use(express.json()).use(createAccessRouter({ mailer, env: {} }));
    const s = open.listen(0);
    const port = (s.address() as { port: number }).port;
    const res = await fetch(`http://localhost:${port}/api/admin/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ email: "x@example.com" }),
    });
    expect(res.status).toBe(409);
    s.close();
    expect(await isEmailAllowed("anyone@example.com", {})).toBe(true);
  });
});
