import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createTestUser } from "./helpers";
import { createInterestRouter } from "../interest";
import type { EmailMessage, Mailer } from "../email";

const sent: EmailMessage[] = [];
const mailer: Mailer = { configured: true, send: vi.fn(async (m: EmailMessage) => void sent.push(m)) };
let clock = 0;

const app = express();
app.use(express.json());
app.use(
  createInterestRouter({ mailer, env: { ADMIN_EMAILS: "admin@example.com", APP_URL: "https://stockwatch.test" }, now: () => clock })
);

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const member = await createTestUser("member@example.com");
const admin = await createTestUser("admin@example.com");

function post(body: unknown, ip = "1.1.1.1") {
  return fetch(`${baseUrl}/api/interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Real-IP": ip },
    body: JSON.stringify(body),
  });
}
const get = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

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

describe("POST /api/interest", () => {
  it("saves the request and emails the admins", async () => {
    const res = await post({ email: "  Jane@Example.com ", name: "Jane", note: "I trade <breakouts>" });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ to: "admin@example.com", subject: "StockWatch: jane@example.com registered interest" });
    expect(sent[0].text).toContain("https://stockwatch.test/users");
    expect(sent[0].html).toContain("&lt;breakouts&gt;");
  });

  it("accepts a repeat without a second email or overwriting the first", async () => {
    expect((await post({ email: "jane@example.com", note: "again" }, "2.2.2.2")).status).toBe(201);
    const { requests } = await (await get("/api/admin/interest", admin.cookie)).json();
    expect(requests.filter((r: { email: string }) => r.email === "jane@example.com")).toEqual([
      expect.objectContaining({ name: "Jane", note: "I trade <breakouts>" }),
    ]);
    expect(sent).toHaveLength(1);
  });

  it("rejects an invalid email", async () => {
    for (const email of ["", "nope", "a@b", 42]) {
      expect((await post({ email }, "3.3.3.3")).status).toBe(400);
    }
  });

  it("limits how often one address can send", async () => {
    clock = 10_000_000;
    for (let i = 0; i < 5; i++) expect((await post({ email: `x${i}@example.com` }, "9.9.9.9")).status).toBe(201);
    expect((await post({ email: "x6@example.com" }, "9.9.9.9")).status).toBe(429);
    expect((await post({ email: "y@example.com" }, "8.8.8.8")).status).toBe(201);
    clock += 60 * 60 * 1000 + 1;
    expect((await post({ email: "x7@example.com" }, "9.9.9.9")).status).toBe(201);
  });
});

describe("/api/admin/interest", () => {
  it("is for admins only", async () => {
    expect((await get("/api/admin/interest")).status).toBe(401);
    expect((await get("/api/admin/interest", member.cookie)).status).toBe(403);
    const del = await fetch(`${baseUrl}/api/admin/interest/jane@example.com`, { method: "DELETE", headers: { Cookie: member.cookie } });
    expect(del.status).toBe(403);
  });

  it("lists requests newest first and removes one", async () => {
    const { requests } = await (await get("/api/admin/interest", admin.cookie)).json();
    expect(requests[0].email).toBe("x7@example.com");
    expect(requests.at(-1)).toMatchObject({ email: "jane@example.com", name: "Jane" });
    expect(new Date(requests[0].createdAt).getTime()).toBeGreaterThan(0);

    const del = (email: string) => fetch(`${baseUrl}/api/admin/interest/${email}`, { method: "DELETE", headers: { Cookie: admin.cookie } });
    expect((await del("Jane@example.com")).status).toBe(204);
    expect((await del("jane@example.com")).status).toBe(404);
  });
});
