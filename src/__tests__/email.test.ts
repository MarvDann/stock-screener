import { describe, it, expect, vi, afterEach } from "vitest";
import { createMailer } from "../email";

const message = { to: "me@example.com", subject: "Hi", text: "Plain body", html: "<p>Body</p>" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMailer", () => {
  it("logs emails instead of sending when Resend isn't configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const mailer = createMailer({});
    expect(mailer.configured).toBe(false);
    await mailer.send(message);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain("Plain body");
  });

  it("sends through Resend's API when configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const mailer = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: "Screener <hi@screener.test>" });
    expect(mailer.configured).toBe(true);
    await mailer.send(message);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Screener <hi@screener.test>",
      to: ["me@example.com"],
      subject: "Hi",
      text: "Plain body",
      html: "<p>Body</p>",
    });
  });

  it("throws when Resend rejects the email", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("domain not verified", { status: 403 }));
    const mailer = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: "hi@screener.test" });
    await expect(mailer.send(message)).rejects.toThrow("Resend responded 403: domain not verified");
  });
});
