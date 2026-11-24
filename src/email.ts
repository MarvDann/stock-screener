export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** True when emails actually go out; false when they're only logged (no provider configured). */
  readonly configured: boolean;
  send(message: EmailMessage): Promise<void>;
}

const RESEND_URL = "https://api.resend.com/emails";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailContent {
  /** e.g. "Hi Jane,"; omitted for "Hi,". */
  name?: string;
  paragraphs: string[];
  /** The one thing to click. Its link is the first in the plain-text version. */
  button?: { label: string; url: string };
  /** Short notes after the button. */
  after?: string[];
  /** Why they got this email, shown small at the bottom. */
  reason: string;
}

/**
 * The layout every StockWatch email uses: a greeting, a short explanation, one
 * clear button and why they're getting it, in both plain text and simple HTML.
 * The HTML shows only the button, not the raw address; the plain-text version
 * (for mail apps that don't show HTML) has to spell the link out.
 * Written like a personal email rather than a bare link, which spam filters
 * treat as suspicious.
 */
export function renderEmail({ name, paragraphs, button, after = [], reason }: EmailContent): { text: string; html: string } {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = [
    greeting,
    ...paragraphs,
    ...(button ? [`${button.label}:\n${button.url}`] : []),
    ...after,
    "Thanks,\nStockWatch",
    `--\n${reason}`,
  ].join("\n\n");

  const p = (t: string, style = "") => `<p style="margin:0 0 16px;${style}">${escapeHtml(t)}</p>`;
  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`,
    `<body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d2129;font-size:15px;line-height:1.55">`,
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">`,
    p(greeting),
    ...paragraphs.map((t) => p(t)),
    button
      ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#3b7cf0;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600">${escapeHtml(button.label)}</a></p>`
      : "",
    ...after.map((t) => p(t)),
    `<p style="margin:0 0 16px">Thanks,<br>StockWatch</p>`,
    `</div>`,
    `<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a909c;text-align:center">${escapeHtml(reason)}</p>`,
    `</body></html>`,
  ].join("");
  return { text, html };
}

/**
 * Sends email through Resend (https://resend.com) when RESEND_API_KEY and
 * EMAIL_FROM are set. Without them — e.g. in local development — each email
 * is printed to the server console instead, so flows like password reset
 * still work end to end.
 */
export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  // Optional: where replies go, e.g. a mailbox that exists (the From address may not accept mail).
  const replyTo = env.EMAIL_REPLY_TO;

  if (!apiKey || !from) {
    return {
      configured: false,
      async send(message) {
        console.warn(
          [
            "── Email not sent (set RESEND_API_KEY and EMAIL_FROM to send for real) ──",
            `To: ${message.to}`,
            `Subject: ${message.subject}`,
            "",
            message.text,
            "────",
          ].join("\n")
        );
      },
    };
  }

  return {
    configured: true,
    async send(message) {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    },
  };
}
