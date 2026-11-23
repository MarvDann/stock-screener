import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("better-auth/vue", () => ({ createAuthClient: () => ({}) }));

const meResponse = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe("auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("looks the session up once and caches it until cleared", async () => {
    const fetchMock = vi.fn().mockResolvedValue(meResponse(200, { id: "u1", email: "me@example.com", name: "me", isAdmin: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { getSessionUser, clearSessionCache } = await import("../auth");

    expect(await getSessionUser()).toEqual({ id: "u1", email: "me@example.com", name: "me", isAdmin: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.anything());
    await getSessionUser();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearSessionCache();
    await getSessionUser();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a missing admin flag as not an admin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(meResponse(200, { id: "u1", email: "me@example.com", name: "me" })));
    const { getSessionUser } = await import("../auth");
    expect((await getSessionUser())?.isAdmin).toBe(false);
  });

  it("is null when signed out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(meResponse(401)));
    const { getSessionUser } = await import("../auth");
    expect(await getSessionUser()).toBeNull();
  });

  it("doesn't cache a failed lookup", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(meResponse(500)).mockResolvedValue(meResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    const { getSessionUser } = await import("../auth");
    expect(await getSessionUser()).toBeNull();
    expect(await getSessionUser()).toBeNull();
    await getSessionUser();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("says whether sign-up is invite-only", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ providers: [], inviteOnly: true }) }));
    const { fetchAuthConfig } = await import("../auth");
    expect(await fetchAuthConfig()).toEqual({ providers: [], inviteOnly: true });
  });

  it("fetches the configured providers, empty when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ providers: ["google"] }) }));
    const { fetchAuthProviders } = await import("../auth");
    expect(await fetchAuthProviders()).toEqual(["google"]);

    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const fresh = await import("../auth");
    expect(await fresh.fetchAuthProviders()).toEqual([]);
  });

  it("explains OAuth error codes", async () => {
    const { oauthErrorMessage } = await import("../auth");
    expect(oauthErrorMessage("signup_disabled")).toBe("This email isn't on the invite list.");
    expect(oauthErrorMessage("This email isn't on the invite list")).toBe("This email isn't on the invite list.");
    expect(oauthErrorMessage("access_denied")).toBe("Sign-in was cancelled.");
    expect(oauthErrorMessage("account_not_linked")).toContain("connect this provider");
    expect(oauthErrorMessage("something_else")).toBe("Sign-in didn't complete — try again.");
  });
});
