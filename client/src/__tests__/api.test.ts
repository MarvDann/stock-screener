import { describe, it, expect, beforeEach, vi } from "vitest";

const routerPushMock = vi.fn();
vi.mock("../router", () => ({
  default: { push: routerPushMock },
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("api", () => {
  beforeEach(() => {
    localStorage.clear();
    routerPushMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("isAuthenticated reflects whether a token is stored", async () => {
    const { isAuthenticated } = await import("../api");
    expect(isAuthenticated()).toBe(false);
    localStorage.setItem("token", "abc");
    expect(isAuthenticated()).toBe(true);
  });

  it("clearToken removes the stored token", async () => {
    localStorage.setItem("token", "abc");
    const { clearToken, isAuthenticated } = await import("../api");
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });

  it("sends no Authorization header when unauthenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { triggered: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchBreakout } = await import("../api");
    await fetchBreakout();

    expect(fetchMock).toHaveBeenCalledWith("/api/breakout", { headers: {} });
  });

  it("attaches a bearer token when authenticated", async () => {
    localStorage.setItem("token", "my-token");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSectorRotation } = await import("../api");
    await fetchSectorRotation();

    expect(fetchMock).toHaveBeenCalledWith("/api/sector-rotation", {
      headers: { Authorization: "Bearer my-token" },
    });
  });

  it("URL-encodes the symbol for stock detail requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchStockDetail } = await import("../api");
    await fetchStockDetail("BRK/A");

    expect(fetchMock).toHaveBeenCalledWith("/api/stock/BRK%2FA", { headers: {} });
  });

  it("resolves with the parsed JSON body on success", async () => {
    const body = { triggered: [], approaching: [], warnings: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, body)));

    const { fetchBreakout } = await import("../api");
    await expect(fetchBreakout()).resolves.toEqual(body);
  });

  it("throws a network error message when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const { fetchBreakout } = await import("../api");
    await expect(fetchBreakout()).rejects.toThrow(
      "Network error — check your connection and try again"
    );
  });

  it("clears the token, redirects to login, and throws on 401", async () => {
    localStorage.setItem("token", "my-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));

    const { fetchBreakout, isAuthenticated } = await import("../api");
    await expect(fetchBreakout()).rejects.toThrow("Session expired — please log in again");

    expect(isAuthenticated()).toBe(false);
    expect(routerPushMock).toHaveBeenCalledWith("/login");
  });

  it("throws the server-provided message on a 5xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(500, { error: "db unavailable" }))
    );

    const { fetchBreakout } = await import("../api");
    await expect(fetchBreakout()).rejects.toThrow("db unavailable");
  });

  it("falls back to a generic message on a 5xx response with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.reject(new Error("no body")),
      } as unknown as Response)
    );

    const { fetchBreakout } = await import("../api");
    await expect(fetchBreakout()).rejects.toThrow("Server error — try again in a moment");
  });

  it("throws a status-coded message on a 4xx response with no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, {})));

    const { fetchBreakout } = await import("../api");
    await expect(fetchBreakout()).rejects.toThrow("Request failed (404)");
  });

  it("reads the signed-in email from the stored token", async () => {
    const { currentUserEmail, setToken } = await import("../api");
    expect(currentUserEmail()).toBeNull();
    const payload = btoa(JSON.stringify({ id: 1, email: "me@example.com" })).replace(/=+$/, "");
    setToken(`header.${payload}.signature`);
    expect(currentUserEmail()).toBe("me@example.com");
    setToken("not-a-jwt");
    expect(currentUserEmail()).toBeNull();
  });
});
