import { sanitiseHeaderValue } from "../headers.js";
import type { MailProvider } from "../provider.js";

export interface ResendMailProviderConfig {
  /** Resend API key, `re_…`. */
  apiKey: string;
  /** A sender on a domain verified in Resend, e.g. `Tsukue <comments@notify.example.com>`. */
  from: string;
}

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends through Resend (AGENTS 15.1).
 *
 * A dedicated adapter rather than a generic `MAIL_ENDPOINT` pointed at Resend,
 * because the two are not the same wire format: Resend spells the reply-to
 * field `reply_to`, and the credential is an API key it issued rather than an
 * arbitrary bearer token. A near-miss on either fails at the provider, where it
 * surfaces as mail that was never sent.
 *
 * The same three environment variables drive every adapter — `MAIL_PROVIDER`
 * selects, `MAIL_TOKEN` is the credential, `MAIL_FROM` is the sender — so
 * changing providers is a configuration change and not a code change.
 */
export class ResendMailProvider implements MailProvider {
  constructor(
    private readonly config: ResendMailProviderConfig,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async send(input: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    // Addresses, the subject and any List-Unsubscribe pair are header values
    // wherever they end up. The body is left alone: it is HTML and belongs to
    // the template, which escapes it.
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      headers[sanitiseHeaderValue(key)] = sanitiseHeaderValue(value);
    }

    // Detached, not `this.fetchImpl(...)`: see the note in http.ts — the
    // runtime's `fetch` refuses a foreign receiver.
    const call = this.fetchImpl ?? fetch;
    const response = await call(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        from: sanitiseHeaderValue(input.from ?? this.config.from),
        to: sanitiseHeaderValue(input.to),
        subject: sanitiseHeaderValue(input.subject),
        html: input.html,
        text: input.text,
        reply_to: input.replyTo
          ? sanitiseHeaderValue(input.replyTo)
          : undefined,
        // Only sent when there is something in it: an empty header set is one
        // more thing for a reader of the payload to wonder about.
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Resend returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
  }
}
