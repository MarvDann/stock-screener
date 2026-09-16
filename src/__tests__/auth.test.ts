import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import authRouter from "../auth";
import "../db";

const app = express();
app.use(express.json());
app.use(authRouter);

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== "string") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

const testEmail = `test-${Date.now()}@example.com`;
const testPassword = "securepass123";

describe("POST /api/auth/register", () => {
  it("returns a token on successful registration", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
  });

  it("rejects duplicate email with 409", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects password shorter than 8 characters", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "short@example.com", password: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing fields", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a token with correct credentials", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.token).toBeDefined();
  });

  it("rejects wrong password with 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "wrongpassword" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-existent email with 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "whatever123" }),
    });
    expect(res.status).toBe(401);
  });
});
