import { describe, it, expect, beforeEach, vi } from "vitest";

const getSession = vi.fn();
vi.mock("better-auth/vue", () => ({
  createAuthClient: () => ({ getSession: () => getSession() }),
}));

describe("auth", () => {
  beforeEach(() => {
    vi.resetModules();
    getSession.mockReset();
    vi.unstubAllGlobals();
  });

  it("looks the session up once and caches it until cleared", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "u1", email: "me@example.com", name: "me" } } });
    const { getSessionUser, clearSessionCache } = await import("../auth");

    expect(await getSessionUser()).toEqual({ id: "u1", email: "me@example.com", name: "me" });
    await getSessionUser();
    expect(getSession).toHaveBeenCalledTimes(1);

    clearSessionCache();
    await getSessionUser();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("is null when signed out", async () => {
    getSession.mockResolvedValue({ data: null });
    const { getSessionUser } = await import("../auth");
    expect(await getSessionUser()).toBeNull();
  });

  it("doesn't cache a failed lookup", async () => {
    getSession.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: null });
    const { getSessionUser } = await import("../auth");
    expect(await getSessionUser()).toBeNull();
    await getSessionUser();
    expect(getSession).toHaveBeenCalledTimes(2);
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
