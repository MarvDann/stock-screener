import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import UsersView from "../UsersView.vue";

const fetchUsers = vi.fn();
const fetchInterestRequests = vi.fn();
const removeInterestRequest = vi.fn();
vi.mock("../../api", () => ({
  fetchUsers: (...args: unknown[]) => fetchUsers(...args),
  fetchInterestRequests: (...args: unknown[]) => fetchInterestRequests(...args),
  removeInterestRequest: (...args: unknown[]) => removeInterestRequest(...args),
}));

beforeEach(() => {
  fetchInterestRequests.mockReset().mockResolvedValue([
    { email: "jane@example.com", name: "Jane", note: "Swing trader", createdAt: "2026-11-22T10:00:00Z" },
  ]);
  removeInterestRequest.mockReset().mockResolvedValue(undefined);
  fetchUsers.mockReset().mockResolvedValue([
    {
      id: "u2",
      name: "Rob",
      email: "rob@example.com",
      emailVerified: false,
      isAdmin: false,
      signInMethods: ["credential", "github"],
      createdAt: "2026-11-01T10:00:00Z",
      lastActiveAt: null,
    },
    {
      id: "u1",
      name: "Marv",
      email: "marv@example.com",
      emailVerified: true,
      isAdmin: true,
      signInMethods: ["credential"],
      createdAt: "2026-08-23T10:00:00Z",
      lastActiveAt: "2026-11-23T09:00:00Z",
    },
  ]);
});

describe("UsersView", () => {
  it("lists each user with their role, sign-in methods and activity", async () => {
    const wrapper = mount(UsersView);
    await flushPromises();
    const rows = wrapper.findAll("table:not(.waiting) tbody tr");
    expect(rows).toHaveLength(2);
    expect(wrapper.find(".count").text()).toBe("2 accounts");

    expect(rows[0].text()).toContain("rob@example.com");
    expect(rows[0].text()).toContain("Unverified");
    expect(rows[0].find(".role").text()).toBe("Member");
    expect(rows[0].text()).toContain("Password, GitHub");
    expect(rows[0].text()).toContain("Never");

    expect(rows[1].find(".role").text()).toBe("Admin");
    expect(rows[1].text()).not.toContain("Unverified");
  });

  it("shows an error with a retry", async () => {
    fetchUsers.mockRejectedValueOnce(new Error("Only an admin can do that"));
    const wrapper = mount(UsersView);
    await flushPromises();
    expect(wrapper.find(".error-state").text()).toContain("Only an admin can do that");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(wrapper.findAll("table:not(.waiting) tbody tr")).toHaveLength(2);
  });

  it("shows the waiting list and removes someone after confirming", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const wrapper = mount(UsersView);
    await flushPromises();
    const rows = () => wrapper.findAll(".waiting tbody tr");
    expect(rows()[0].text()).toContain("jane@example.com");
    expect(rows()[0].text()).toContain("Swing trader");
    expect(wrapper.findAll(".count")[1].text()).toBe("1 person");

    await rows()[0].find(".remove-btn").trigger("click");
    await flushPromises();
    expect(removeInterestRequest).toHaveBeenCalledWith("jane@example.com");
    expect(rows()[0].text()).toContain("Nobody's waiting.");
    vi.unstubAllGlobals();
  });
});
