import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ForgotPasswordView from "../ForgotPasswordView.vue";
import ResetPasswordView from "../ResetPasswordView.vue";
import AccountView from "../AccountView.vue";
import LoginView from "../LoginView.vue";

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const changePassword = vi.fn();
const setToken = vi.fn();
vi.mock("../../api", () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
  resetPassword: (...a: unknown[]) => resetPassword(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  setToken: (...a: unknown[]) => setToken(...a),
  currentUserEmail: () => "me@example.com",
}));

const blank = { template: "<div />" };

async function mountAt(component: object, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: blank },
      { path: "/login", name: "login", component: blank },
      { path: "/forgot-password", name: "forgot-password", component: blank },
      { path: "/reset-password", name: "reset-password", component: blank },
      { path: "/account", name: "account", component: blank },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  for (const fn of [requestPasswordReset, resetPassword, changePassword, setToken]) fn.mockReset();
});

describe("LoginView", () => {
  it("links to forgot password, carrying over the email typed so far", async () => {
    const { wrapper } = await mountAt(LoginView, "/login");
    await wrapper.find('input[type="email"]').setValue("me@example.com");
    expect(wrapper.find(".forgot-link").attributes("href")).toBe("/forgot-password?email=me@example.com");
  });

  it("hides the link while registering", async () => {
    const { wrapper } = await mountAt(LoginView, "/login");
    await wrapper.find(".form-footer a").trigger("click");
    expect(wrapper.find(".forgot-link").exists()).toBe(false);
  });
});

describe("ForgotPasswordView", () => {
  it("prefills the email and shows the server's confirmation after sending", async () => {
    requestPasswordReset.mockResolvedValue("If an account exists for that email, we've sent a link.");
    const { wrapper } = await mountAt(ForgotPasswordView, "/forgot-password?email=me%40example.com");

    expect((wrapper.find('input[type="email"]').element as HTMLInputElement).value).toBe("me@example.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(requestPasswordReset).toHaveBeenCalledWith("me@example.com");
    expect(wrapper.find(".form-success").text()).toContain("If an account exists");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("shows errors such as rate limiting", async () => {
    requestPasswordReset.mockRejectedValue(new Error("Too many reset requests — try again in a few minutes"));
    const { wrapper } = await mountAt(ForgotPasswordView, "/forgot-password");
    await wrapper.find('input[type="email"]').setValue("me@example.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find(".form-error").text()).toContain("Too many reset requests");
  });
});

describe("ResetPasswordView", () => {
  async function fill(wrapper: Awaited<ReturnType<typeof mountAt>>["wrapper"], password: string, confirm: string) {
    const inputs = wrapper.findAll('input[type="password"]');
    await inputs[0].setValue(password);
    await inputs[1].setValue(confirm);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
  }

  it("sets the new password, logs in and goes home", async () => {
    resetPassword.mockResolvedValue("new-login-token");
    const { wrapper, router } = await mountAt(ResetPasswordView, "/reset-password?token=abc123");
    await fill(wrapper, "brand-new-pass", "brand-new-pass");

    expect(resetPassword).toHaveBeenCalledWith("abc123", "brand-new-pass");
    expect(setToken).toHaveBeenCalledWith("new-login-token");
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("checks the two passwords match before sending", async () => {
    const { wrapper } = await mountAt(ResetPasswordView, "/reset-password?token=abc123");
    await fill(wrapper, "brand-new-pass", "different-pass");
    expect(resetPassword).not.toHaveBeenCalled();
    expect(wrapper.find(".form-error").text()).toBe("The passwords don't match");
  });

  it("offers a new link when this one has expired", async () => {
    resetPassword.mockRejectedValue(new Error("This reset link is invalid or has expired — request a new one"));
    const { wrapper } = await mountAt(ResetPasswordView, "/reset-password?token=old");
    await fill(wrapper, "brand-new-pass", "brand-new-pass");
    expect(wrapper.find(".form-error a").attributes("href")).toBe("/forgot-password");
  });

  it("explains when the link has no token", async () => {
    const { wrapper } = await mountAt(ResetPasswordView, "/reset-password");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find(".form-error").text()).toContain("incomplete");
  });
});

describe("AccountView", () => {
  async function fill(wrapper: Awaited<ReturnType<typeof mountAt>>["wrapper"], current: string, next: string, confirm: string) {
    const inputs = wrapper.findAll('input[type="password"]');
    await inputs[0].setValue(current);
    await inputs[1].setValue(next);
    await inputs[2].setValue(confirm);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
  }

  it("shows who's signed in", async () => {
    const { wrapper } = await mountAt(AccountView, "/account");
    expect(wrapper.find(".email").text()).toBe("me@example.com");
  });

  it("changes the password, keeps you signed in with the new token and clears the form", async () => {
    changePassword.mockResolvedValue("rotated-token");
    const { wrapper } = await mountAt(AccountView, "/account");
    await fill(wrapper, "old-password", "new-password", "new-password");

    expect(changePassword).toHaveBeenCalledWith("old-password", "new-password");
    expect(setToken).toHaveBeenCalledWith("rotated-token");
    expect(wrapper.find(".form-success").text()).toContain("Password changed");
    expect(wrapper.findAll('input[type="password"]').map((i) => (i.element as HTMLInputElement).value)).toEqual(["", "", ""]);
  });

  it("shows the server's error for a wrong current password", async () => {
    changePassword.mockRejectedValue(new Error("Current password is incorrect"));
    const { wrapper } = await mountAt(AccountView, "/account");
    await fill(wrapper, "wrong", "new-password", "new-password");
    expect(wrapper.find(".form-error").text()).toBe("Current password is incorrect");
    expect(setToken).not.toHaveBeenCalled();
  });

  it("checks the new passwords match", async () => {
    const { wrapper } = await mountAt(AccountView, "/account");
    await fill(wrapper, "old-password", "new-password", "typo-password");
    expect(changePassword).not.toHaveBeenCalled();
    expect(wrapper.find(".form-error").text()).toBe("The new passwords don't match");
  });
});
