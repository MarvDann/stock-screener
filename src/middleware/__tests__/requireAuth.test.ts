import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { requireAuth } from "../requireAuth";
import { JWT_SECRET } from "../../jwtSecret";
import db from "../../db";
import { createTestUser } from "../../__tests__/helpers";

function mockReqResNext(authHeader?: string) {
  const req: any = { headers: { authorization: authHeader } };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe("requireAuth", () => {
  it("returns 401 when no Authorization header", () => {
    const { req, res, next } = mockReqResNext();
    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header doesn't start with Bearer", () => {
    const { req, res, next } = mockReqResNext("Basic abc123");
    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 with an invalid token", () => {
    const { req, res, next } = mockReqResNext("Bearer invalid.token.here");
    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next and sets req.user with a valid token", () => {
    const user = createTestUser("valid@example.com");
    const { req, res, next } = mockReqResNext(`Bearer ${user.token}`);
    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: user.id, email: "valid@example.com" });
  });

  it("accepts tokens issued before token versions existed while the version is still 0", () => {
    const user = createTestUser();
    const legacy = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    const { req, res, next } = mockReqResNext(`Bearer ${legacy}`);
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects tokens issued before a password change", () => {
    const user = createTestUser();
    db.prepare("UPDATE users SET token_version = 1 WHERE id = ?").run(user.id);
    const { req, res, next } = mockReqResNext(`Bearer ${user.token}`);
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects tokens for a user that no longer exists", () => {
    const token = jwt.sign({ id: 999999, email: "gone@example.com", tv: 0 }, JWT_SECRET);
    const { req, res, next } = mockReqResNext(`Bearer ${token}`);
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
