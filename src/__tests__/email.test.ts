import { describe, it, expect, vi, afterEach } from "vitest";
import { createMailer, renderEmail } from "../email";

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
    const mailer = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: "StockWatch <hi@stockwatch.test>" });
    expect(mailer.configured).toBe(true);
    await mailer.send(message);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "StockWatch <hi@stockwatch.test>",
      to: ["me@example.com"],
      subject: "Hi",
      text: "Plain body",
      html: "<p>Body</p>",
    });
  });

  it("throws when Resend rejects the email", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("domain not verified", { status: 403 }));
    const mailer = createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: "hi@stockwatch.test" });
    await expect(mailer.send(message)).rejects.toThrow("Resend responded 403: domain not verified");
  });
});

describe("renderEmail", () => {
  const email = renderEmail({
    name: "Jane <J>",
    paragraphs: ["First.", "Second."],
    button: { label: "Do it", url: "https://stockwatch.test/go?a=1&b=2" },
    after: ["Afterwards."],
    reason: "Because you asked.",
  });

  it("writes a greeting, the paragraphs, the link and the reason in plain text", () => {
    expect(email.text.split("\n\n")).toEqual([
      "Hi Jane <J>,",
      "First.",
      "Second.",
      "Do it:\nhttps://stockwatch.test/go?a=1&b=2",
      "Afterwards.",
      "Thanks,\nStockWatch",
      "--\nBecause you asked.",
    ]);
  });

  it("shows a button in the HTML, not the raw address, and escapes everything", () => {
    expect(email.html).toContain('<a href="https://stockwatch.test/go?a=1&amp;b=2"');
    expect(email.html).toContain(">Do it</a>");
    expect(email.html).not.toContain(">https://stockwatch.test");
    expect(email.html).toContain("Hi Jane &lt;J&gt;,");
  });

  it("says plain Hi without a name", () => {
    expect(renderEmail({ paragraphs: [], reason: "r" }).text.startsWith("Hi,\n")).toBe(true);
  });
});

describe("reply-to", () => {
  it("sets where replies go when EMAIL_REPLY_TO is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await createMailer({ RESEND_API_KEY: "re_test", EMAIL_FROM: "a@x.test", EMAIL_REPLY_TO: "hello@x.test" }).send(message);
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).reply_to).toBe("hello@x.test");
  });
});
