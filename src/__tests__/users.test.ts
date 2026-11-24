import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createTestUser } from "./helpers";
import { createUsersRouter } from "../users";

const app = express();
app.use(createUsersRouter());

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const member = await createTestUser("member@example.com");
// ADMIN_EMAILS is admin@example.com (vitest.config.ts); the case shouldn't matter.
const admin = await createTestUser("Admin@Example.com");

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

describe("/api/me", () => {
  it("says whether the signed-in user is an admin", async () => {
    expect(await (await get("/api/me", member.cookie)).json()).toMatchObject({ email: "member@example.com", isAdmin: false });
    expect(await (await get("/api/me", admin.cookie)).json()).toMatchObject({ id: admin.id, isAdmin: true });
  });

  it("requires auth", async () => {
    expect((await get("/api/me")).status).toBe(401);
  });
});

describe("/api/admin/users", () => {
  it("is for admins only", async () => {
    expect((await get("/api/admin/users")).status).toBe(401);
    expect((await get("/api/admin/users", member.cookie)).status).toBe(403);
  });

  it("lists every user, newest first, with their role and last activity", async () => {
    const res = await get("/api/admin/users", admin.cookie);
    expect(res.status).toBe(200);
    const { users } = await res.json();
    expect(users.map((u: { email: string }) => u.email)).toEqual(["admin@example.com", "member@example.com"]);
    expect(users[0]).toMatchObject({ id: admin.id, isAdmin: true, emailVerified: true, signInMethods: [] });
    expect(users[1]).toMatchObject({ isAdmin: false });
    // ALLOWED_EMAILS isn't set in the tests, so the site is open and everyone's access comes from the server.
    expect(users.map((u: { access: string }) => u.access)).toEqual(["server", "server"]);
    expect(new Date(users[1].lastActiveAt).getTime()).toBeGreaterThan(0);
    expect(new Date(users[1].createdAt).getTime()).toBeGreaterThan(0);
  });
});
