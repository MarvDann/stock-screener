import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WelcomeView from "../WelcomeView.vue";
import { makeTestRouter } from "../../__tests__/testRouter";

const registerInterest = vi.fn();
vi.mock("../../api", () => ({ registerInterest: (...args: unknown[]) => registerInterest(...args) }));

async function mountView() {
  const router = makeTestRouter();
  router.addRoute({ path: "/login", name: "login", component: { template: "<div />" } });
  router.addRoute({ path: "/privacy", name: "privacy", component: { template: "<div />" } });
  await router.push("/");
  await router.isReady();
  return mount(WelcomeView, { global: { plugins: [router] } });
}

beforeEach(() => {
  registerInterest.mockReset().mockResolvedValue(undefined);
});

describe("WelcomeView", () => {
  it("shows the features and is upfront about what the site doesn't do", async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll(".feature").length).toBeGreaterThanOrEqual(6);
    expect(wrapper.text()).toContain("No real-time streaming quotes");
    expect(wrapper.text()).toContain("Not financial advice");
    expect(wrapper.find('a[href="/login"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/privacy"]').exists()).toBe(true);
  });

  it("registers interest and thanks the visitor", async () => {
    const wrapper = await mountView();
    await wrapper.find('input[type="email"]').setValue(" jane@example.com ");
    await wrapper.find('input[type="text"]').setValue("Jane");
    await wrapper.find("textarea").setValue("Swing trading");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(registerInterest).toHaveBeenCalledWith({ email: "jane@example.com", name: "Jane", note: "Swing trading" });
    expect(wrapper.find(".form-success").text()).toContain("You're on the list");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("shows the server's error and keeps the form", async () => {
    registerInterest.mockRejectedValue(new Error("Too many requests — try again later"));
    const wrapper = await mountView();
    await wrapper.find('input[type="email"]').setValue("jane@example.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find(".form-error").text()).toBe("Too many requests — try again later");
    expect(wrapper.find("form").exists()).toBe(true);
  });
});
