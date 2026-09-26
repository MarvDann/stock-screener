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

/**
 * Sends email through Resend (https://resend.com) when RESEND_API_KEY and
 * EMAIL_FROM are set. Without them — e.g. in local development — each email
 * is printed to the server console instead, so flows like password reset
 * still work end to end.
 */
export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

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
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) {
        throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    },
  };
}
