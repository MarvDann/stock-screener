import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ForgotPasswordView from "../ForgotPasswordView.vue";
import ResetPasswordView from "../ResetPasswordView.vue";
import AccountView from "../AccountView.vue";
import LoginView from "../LoginView.vue";

const { authClient, getSessionUser, fetchAuthProviders, fetchAuthConfig, clearSessionCache } = vi.hoisted(() => ({
  authClient: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    listAccounts: vi.fn(),
    linkSocial: vi.fn(),
  },
  getSessionUser: vi.fn(),
  fetchAuthProviders: vi.fn(),
  fetchAuthConfig: vi.fn(),
  clearSessionCache: vi.fn(),
}));
vi.mock("../../auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth")>()),
  authClient,
  getSessionUser,
  fetchAuthProviders,
  fetchAuthConfig,
  clearSessionCache,
}));

const ok = (data: unknown = {}) => ({ data, error: null });
const failed = (message: string, code?: string) => ({ data: null, error: { message, code, status: 400 } });

const blank = { template: "<div />" };

async function mountAt(component: object, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: blank },
      { path: "/login", name: "login", component: blank },
      { path: "/welcome", name: "welcome", component: blank },
      { path: "/privacy", name: "privacy", component: blank },
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
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "u1", email: "me@example.com", name: "me" });
  fetchAuthProviders.mockResolvedValue([]);
  // The login page reads both at once; tests set the providers through fetchAuthProviders.
  fetchAuthConfig.mockImplementation(async () => ({ providers: await fetchAuthProviders(), inviteOnly: false }));
  authClient.listAccounts.mockResolvedValue(ok([{ providerId: "credential" }]));
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

  async function submitAs(wrapper: Awaited<ReturnType<typeof mountAt>>["wrapper"], email: string, password: string) {
    await wrapper.find('input[type="email"]').setValue(email);
    await wrapper.find('input[type="password"]').setValue(password);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
  }

  it("logs in, drops the cached session and goes home", async () => {
    authClient.signIn.email.mockResolvedValue(ok({ token: "t" }));
    const { wrapper, router } = await mountAt(LoginView, "/login");
    await submitAs(wrapper, " me@example.com ", "my-password");

    expect(authClient.signIn.email).toHaveBeenCalledWith({ email: "me@example.com", password: "my-password", callbackURL: "/" });
    expect(clearSessionCache).toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("shows the server's error for bad credentials", async () => {
    authClient.signIn.email.mockResolvedValue(failed("Invalid email or password"));
    const { wrapper, router } = await mountAt(LoginView, "/login");
    await submitAs(wrapper, "me@example.com", "wrong-pass");
    expect(wrapper.find(".form-error").text()).toBe("Invalid email or password");
    expect(router.currentRoute.value.fullPath).toBe("/login");
  });

  it("explains an unverified email", async () => {
    authClient.signIn.email.mockResolvedValue(failed("Email not verified", "EMAIL_NOT_VERIFIED"));
    const { wrapper } = await mountAt(LoginView, "/login");
    await submitAs(wrapper, "me@example.com", "my-password");
    expect(wrapper.find(".form-success").text()).toContain("new verification link");
  });

  it("registers with a name from the email and asks you to verify it", async () => {
    authClient.signUp.email.mockResolvedValue(ok({ token: null, user: {} }));
    const { wrapper, router } = await mountAt(LoginView, "/login");
    await wrapper.find(".form-footer a").trigger("click");
    await submitAs(wrapper, "jane.doe@example.com", "brand-new-pass");

    expect(authClient.signUp.email).toHaveBeenCalledWith({
      email: "jane.doe@example.com",
      password: "brand-new-pass",
      name: "jane.doe",
      callbackURL: "/",
    });
    expect(wrapper.find(".form-success").text()).toContain("Check your email");
    expect(router.currentRoute.value.fullPath).toBe("/login");
  });

  it("shows the invite-list refusal on sign-up", async () => {
    authClient.signUp.email.mockResolvedValue(failed("This email isn't on the invite list"));
    const { wrapper } = await mountAt(LoginView, "/login");
    await wrapper.find(".form-footer a").trigger("click");
    await submitAs(wrapper, "stranger@example.com", "brand-new-pass");
    expect(wrapper.find(".form-error").text()).toBe("This email isn't on the invite list");
  });

  it("points people without an invite to the waiting list, keeping sign-up for invited emails", async () => {
    fetchAuthConfig.mockResolvedValue({ providers: [], inviteOnly: true });
    const { wrapper } = await mountAt(LoginView, "/login");
    const footer = wrapper.find(".form-footer");
    expect(footer.text()).toContain("Not invited yet?");
    expect(footer.find("a").attributes("href")).toBe("/welcome#interest");

    await wrapper.find(".invited-link").trigger("click");
    expect(wrapper.find(".form-submit").text()).toBe("Register");
    expect(wrapper.find(".form-footer").text()).toContain("Already have an account?");
  });

  it("offers only the configured social providers", async () => {
    fetchAuthProviders.mockResolvedValue(["github"]);
    authClient.signIn.social.mockResolvedValue(ok());
    const { wrapper } = await mountAt(LoginView, "/login");

    const buttons = wrapper.findAll(".social-btn");
    expect(buttons.map((b) => b.text())).toEqual(["Continue with GitHub"]);
    await buttons[0].trigger("click");
    expect(authClient.signIn.social).toHaveBeenCalledWith({ provider: "github", callbackURL: "/", errorCallbackURL: "/login" });
  });

  it("hides social sign-in when no provider is configured", async () => {
    const { wrapper } = await mountAt(LoginView, "/login");
    expect(wrapper.find(".social-btn").exists()).toBe(false);
  });

  it("explains an OAuth error passed back in the URL", async () => {
    const { wrapper } = await mountAt(LoginView, "/login?error=signup_disabled");
    expect(wrapper.find(".form-error").text()).toBe("This email isn't on the invite list.");
  });

  it("confirms a password reset", async () => {
    const { wrapper } = await mountAt(LoginView, "/login?reset=1");
    expect(wrapper.find(".form-success").text()).toContain("Password changed");
  });
});

describe("ForgotPasswordView", () => {
  it("prefills the email and confirms without revealing whether the account exists", async () => {
    authClient.requestPasswordReset.mockResolvedValue(ok({ status: true }));
    const { wrapper } = await mountAt(ForgotPasswordView, "/forgot-password?email=me%40example.com");

    expect((wrapper.find('input[type="email"]').element as HTMLInputElement).value).toBe("me@example.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({ email: "me@example.com", redirectTo: "/reset-password" });
    expect(wrapper.find(".form-success").text()).toContain("If an account exists");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("shows errors such as rate limiting", async () => {
    authClient.requestPasswordReset.mockResolvedValue(failed("Too many requests. Please try again later."));
    const { wrapper } = await mountAt(ForgotPasswordView, "/forgot-password");
    await wrapper.find('input[type="email"]').setValue("me@example.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find(".form-error").text()).toContain("Too many requests");
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

  it("sets the new password and sends you to log in with it", async () => {
    authClient.resetPassword.mockResolvedValue(ok({ status: true }));
    const { wrapper, router } = await mountAt(ResetPasswordView, "/reset-password?token=abc123");
    await fill(wrapper, "brand-new-pass", "brand-new-pass");

    expect(authClient.resetPassword).toHaveBeenCalledWith({ newPassword: "brand-new-pass", token: "abc123" });
    expect(router.currentRoute.value.fullPath).toBe("/login?reset=1");
  });

  it("checks the two passwords match before sending", async () => {
    const { wrapper } = await mountAt(ResetPasswordView, "/reset-password?token=abc123");
    await fill(wrapper, "brand-new-pass", "different-pass");
    expect(authClient.resetPassword).not.toHaveBeenCalled();
    expect(wrapper.find(".form-error").text()).toBe("The passwords don't match");
  });

  it("offers a new link when this one has expired", async () => {
    authClient.resetPassword.mockResolvedValue(failed("Invalid token", "INVALID_TOKEN"));
    const { wrapper } = await mountAt(ResetPasswordView, "/reset-password?token=old");
    await fill(wrapper, "brand-new-pass", "brand-new-pass");
    expect(wrapper.find(".form-error a").attributes("href")).toBe("/forgot-password");
  });

  it("explains when the server rejected the link before you got here", async () => {
    const { wrapper } = await mountAt(ResetPasswordView, "/reset-password?error=INVALID_TOKEN");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find(".form-error").text()).toContain("expired");
    expect(wrapper.find(".form-footer a").attributes("href")).toBe("/forgot-password");
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

  it("changes the password, signs out other devices and clears the form", async () => {
    authClient.changePassword.mockResolvedValue(ok({ token: "t" }));
    const { wrapper } = await mountAt(AccountView, "/account");
    await fill(wrapper, "old-password", "new-password", "new-password");

    expect(authClient.changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password",
      revokeOtherSessions: true,
    });
    expect(wrapper.find(".form-success").text()).toContain("Password changed");
    expect(wrapper.findAll('input[type="password"]').map((i) => (i.element as HTMLInputElement).value)).toEqual(["", "", ""]);
  });

  it("shows the server's error for a wrong current password", async () => {
    authClient.changePassword.mockResolvedValue(failed("Invalid password"));
    const { wrapper } = await mountAt(AccountView, "/account");
    await fill(wrapper, "wrong", "new-password", "new-password");
    expect(wrapper.find(".form-error").text()).toBe("Invalid password");
    expect(wrapper.find(".form-success").exists()).toBe(false);
  });

  it("checks the new passwords match", async () => {
    const { wrapper } = await mountAt(AccountView, "/account");
    await fill(wrapper, "old-password", "new-password", "typo-password");
    expect(authClient.changePassword).not.toHaveBeenCalled();
    expect(wrapper.find(".form-error").text()).toBe("The new passwords don't match");
  });

  it("lists linked sign-in methods and offers to connect the rest", async () => {
    fetchAuthProviders.mockResolvedValue(["google", "github"]);
    authClient.listAccounts.mockResolvedValue(ok([{ providerId: "credential" }, { providerId: "github" }]));
    authClient.linkSocial.mockResolvedValue(ok());
    const { wrapper } = await mountAt(AccountView, "/account");

    expect(wrapper.findAll(".accounts li").map((li) => [li.find("span").text(), li.find(".status").exists()])).toEqual([
      ["Email and password", true],
      ["GitHub", true],
      ["Google", false],
    ]);
    await wrapper.find('.connect-btn[data-provider="google"]').trigger("click");
    expect(authClient.linkSocial).toHaveBeenCalledWith({ provider: "google", callbackURL: "/account" });
  });

  it("hides change password for accounts that only sign in with a provider", async () => {
    authClient.listAccounts.mockResolvedValue(ok([{ providerId: "google" }]));
    const { wrapper } = await mountAt(AccountView, "/account");
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(wrapper.find(".note").text()).toContain("You sign in with Google");
  });
});
