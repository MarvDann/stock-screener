import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { requireAuth } from "../requireAuth";
import { JWT_SECRET } from "../../auth";

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
    const token = jwt.sign({ id: 1, email: "test@example.com" }, JWT_SECRET);
    const { req, res, next } = mockReqResNext(`Bearer ${token}`);
    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, email: "test@example.com" });
  });
});
