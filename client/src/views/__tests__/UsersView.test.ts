import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import UsersView from "../UsersView.vue";

const fetchUsers = vi.fn();
vi.mock("../../api", () => ({ fetchUsers: (...args: unknown[]) => fetchUsers(...args) }));

beforeEach(() => {
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
    const rows = wrapper.findAll("tbody tr");
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
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
  });
});
