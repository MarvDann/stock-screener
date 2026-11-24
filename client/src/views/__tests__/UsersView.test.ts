import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import UsersView from "../UsersView.vue";

const api = vi.hoisted(() => ({
  fetchUsers: vi.fn(),
  fetchInvites: vi.fn(),
  fetchInterestRequests: vi.fn(),
  removeInterestRequest: vi.fn(),
  allowAccess: vi.fn(),
  revokeAccess: vi.fn(),
}));
vi.mock("../../api", () => api);

const user = (overrides: Record<string, unknown>) => ({
  id: "u",
  name: "",
  email: "x@example.com",
  emailVerified: true,
  isAdmin: false,
  access: "allowed",
  signInMethods: ["credential"],
  createdAt: "2026-11-01T10:00:00Z",
  lastActiveAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  api.fetchUsers.mockReset().mockResolvedValue([
    user({ id: "u3", name: "Eve", email: "eve@example.com", access: "revoked" }),
    user({ id: "u2", name: "Rob", email: "rob@example.com", emailVerified: false, signInMethods: ["credential", "github"] }),
    user({ id: "u1", name: "Marv", email: "marv@example.com", isAdmin: true, access: "server", lastActiveAt: "2026-11-23T09:00:00Z" }),
  ]);
  api.fetchInvites.mockReset().mockResolvedValue([{ email: "pending@example.com", invitedAt: "2026-11-23T10:00:00Z" }]);
  api.fetchInterestRequests.mockReset().mockResolvedValue([{ email: "jane@example.com", name: "Jane", createdAt: "2026-11-22T10:00:00Z" }]);
  api.removeInterestRequest.mockReset().mockResolvedValue(undefined);
  api.allowAccess.mockReset().mockResolvedValue({ emailed: true });
  api.revokeAccess.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllGlobals());

async function mountView() {
  const wrapper = mount(UsersView);
  await flushPromises();
  return wrapper;
}
const accountRow = (wrapper: Awaited<ReturnType<typeof mountView>>, email: string) =>
  wrapper.findAll(".accounts tbody tr").find((r) => r.text().includes(email))!;

describe("UsersView", () => {
  it("lists each user with their role, sign-in methods, activity and access", async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll(".accounts tbody tr")).toHaveLength(3);
    expect(wrapper.find(".count").text()).toBe("3 accounts");

    const rob = accountRow(wrapper, "rob@example.com");
    expect(rob.text()).toContain("Unverified");
    expect(rob.find(".role").text()).toBe("Member");
    expect(rob.text()).toContain("Password, GitHub");
    expect(rob.text()).toContain("Never");
    expect(rob.find(".access").text()).toContain("Allowed");
    expect(rob.find(".access button").text()).toBe("Revoke");

    const marv = accountRow(wrapper, "marv@example.com");
    expect(marv.find(".role").text()).toBe("Admin");
    expect(marv.find(".access").text()).toBe("Always");
    expect(marv.find(".access button").exists()).toBe(false);

    const eve = accountRow(wrapper, "eve@example.com");
    expect(eve.find(".access").text()).toContain("Revoked");
    expect(eve.find(".access button").text()).toBe("Restore");
  });

  it("lets someone in from the waiting list and says they've been emailed", async () => {
    const wrapper = await mountView();
    await wrapper.find(".waiting tbody tr .row-btn.primary").trigger("click");
    await flushPromises();
    expect(api.allowAccess).toHaveBeenCalledWith("jane@example.com");
    expect(wrapper.find(".message").text()).toContain("jane@example.com can now sign up.");
    expect(wrapper.find(".message").text()).toContain("We've emailed them");
    expect(api.fetchUsers).toHaveBeenCalledTimes(2);
  });

  it("says so when the invite email didn't send", async () => {
    api.allowAccess.mockResolvedValue({ emailed: false });
    const wrapper = await mountView();
    await wrapper.find(".waiting tbody tr .row-btn.primary").trigger("click");
    await flushPromises();
    expect(wrapper.find(".message").text()).toContain("let them know yourself");
  });

  it("revokes access after confirming, and restores it", async () => {
    const wrapper = await mountView();
    await accountRow(wrapper, "rob@example.com").find(".access button").trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(api.revokeAccess).toHaveBeenCalledWith("rob@example.com");
    expect(wrapper.find(".message").text()).toContain("Revoked rob@example.com's access.");

    await accountRow(wrapper, "eve@example.com").find(".access button").trigger("click");
    await flushPromises();
    expect(api.allowAccess).toHaveBeenCalledWith("eve@example.com");
    expect(wrapper.find(".message").text()).toContain("Restored eve@example.com's access.");
  });

  it("doesn't revoke when the confirmation is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const wrapper = await mountView();
    await accountRow(wrapper, "rob@example.com").find(".access button").trigger("click");
    expect(api.revokeAccess).not.toHaveBeenCalled();
  });

  it("invites someone by email and clears the box", async () => {
    const wrapper = await mountView();
    await wrapper.find(".invite-form input").setValue(" new@example.com ");
    await wrapper.find(".invite-form").trigger("submit");
    await flushPromises();
    expect(api.allowAccess).toHaveBeenCalledWith("new@example.com");
    expect((wrapper.find(".invite-form input").element as HTMLInputElement).value).toBe("");
  });

  it("shows the server's refusal and keeps the typed email", async () => {
    api.allowAccess.mockRejectedValue(new Error("They already have access (set on the server)"));
    const wrapper = await mountView();
    await wrapper.find(".invite-form input").setValue("marv@example.com");
    await wrapper.find(".invite-form").trigger("submit");
    await flushPromises();
    expect(wrapper.find(".message.form-error").text()).toBe("They already have access (set on the server)");
    expect((wrapper.find(".invite-form input").element as HTMLInputElement).value).toBe("marv@example.com");
  });

  it("lists pending invites with resend and revoke", async () => {
    const wrapper = await mountView();
    const row = wrapper.find(".invites tbody tr");
    expect(row.text()).toContain("pending@example.com");
    await row.findAll("button")[1].trigger("click");
    await flushPromises();
    expect(api.revokeAccess).toHaveBeenCalledWith("pending@example.com");
  });

  it("removes someone from the waiting list after confirming", async () => {
    const wrapper = await mountView();
    await wrapper.find(".waiting tbody tr .row-btn.danger").trigger("click");
    await flushPromises();
    expect(api.removeInterestRequest).toHaveBeenCalledWith("jane@example.com");
  });

  it("shows an error with a retry", async () => {
    api.fetchUsers.mockRejectedValueOnce(new Error("Only an admin can do that"));
    const wrapper = await mountView();
    expect(wrapper.find(".error-state").text()).toContain("Only an admin can do that");
    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".accounts tbody tr")).toHaveLength(3);
  });
});
