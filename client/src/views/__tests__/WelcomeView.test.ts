import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WelcomeView from "../WelcomeView.vue";
import { makeTestRouter } from "../../__tests__/testRouter";
import { setTheme } from "../../composables/useTheme";

const registerInterest = vi.fn();
const fetchInterestToken = vi.fn();
vi.mock("../../api", () => ({
  registerInterest: (...args: unknown[]) => registerInterest(...args),
  fetchInterestToken: (...args: unknown[]) => fetchInterestToken(...args),
}));

async function mountView() {
  const router = makeTestRouter();
  router.addRoute({ path: "/login", name: "login", component: { template: "<div />" } });
  router.addRoute({ path: "/privacy", name: "privacy", component: { template: "<div />" } });
  await router.push("/");
  await router.isReady();
  return mount(WelcomeView, { global: { plugins: [router] } });
}

beforeEach(() => {
  vi.useRealTimers();
  registerInterest.mockReset().mockResolvedValue(undefined);
  fetchInterestToken.mockReset().mockResolvedValue("tok-1");
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

  it("shows the dashboard screenshot in the current theme", async () => {
    setTheme("dark");
    const wrapper = await mountView();
    expect(wrapper.find(".screenshot img").attributes("src")).toBe("/images/home-dark.png");
    setTheme("matrix");
    await flushPromises();
    expect(wrapper.find(".screenshot img").attributes("src")).toBe("/images/home-matrix.png");
    setTheme("dark");
  });

  it("registers interest with the page's token, waiting out the minimum time, and thanks the visitor", async () => {
    vi.useFakeTimers();
    const wrapper = await mountView();
    await flushPromises();
    expect(wrapper.find("textarea").exists()).toBe(false);
    await wrapper.find('input[type="email"]').setValue(" jane@example.com ");
    await wrapper.find('input[autocomplete="name"]').setValue("Jane");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    // Sent too soon after the page loaded: it waits rather than send something the server would drop.
    expect(registerInterest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4000);
    expect(registerInterest).toHaveBeenCalledWith({ email: "jane@example.com", name: "Jane", token: "tok-1", website: "" });
    expect(wrapper.find(".form-success").text()).toContain("You're on the list");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("gets a token on submit if loading one failed", async () => {
    fetchInterestToken.mockRejectedValueOnce(new Error("offline")).mockResolvedValue("tok-2");
    vi.useFakeTimers();
    const wrapper = await mountView();
    await flushPromises();
    await wrapper.find('input[type="email"]').setValue("jane@example.com");
    await wrapper.find("form").trigger("submit");
    await vi.advanceTimersByTimeAsync(4000);
    expect(registerInterest).toHaveBeenCalledWith(expect.objectContaining({ token: "tok-2" }));
  });

  it("keeps the hidden bot trap out of reach of people", async () => {
    const wrapper = await mountView();
    const trap = wrapper.find('input[name="website"]');
    expect(trap.attributes("tabindex")).toBe("-1");
    expect(wrapper.find(".trap").attributes("aria-hidden")).toBe("true");
  });

  it("shows the server's error and keeps the form", async () => {
    registerInterest.mockRejectedValue(new Error("Too many requests — try again later"));
    vi.useFakeTimers();
    const wrapper = await mountView();
    await wrapper.find('input[type="email"]').setValue("jane@example.com");
    await wrapper.find("form").trigger("submit");
    await vi.advanceTimersByTimeAsync(4000);
    expect(wrapper.find(".form-error").text()).toBe("Too many requests — try again later");
    expect(wrapper.find("form").exists()).toBe(true);
  });
});
