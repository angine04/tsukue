import { sanitiseHeaderValue } from "../headers.js";
import type { MailProvider } from "../provider.js";

export interface HttpMailProviderConfig {
  /** A URL that accepts `{ to, from, subject, html, text }` as JSON. */
  endpoint: string;
  /** Sent as `Authorization: Bearer <token>` when present. */
  token?: string;
  from: string;
}

/**
 * Posts the message as JSON to a configured endpoint.
 *
 * This is the adapter for "some HTTP API that sends mail" — a self-hosted
 * relay, a provider without a dedicated adapter here, a staging sink. It is a
 * real implementation rather than a placeholder: it performs the request and
 * reports failure, so a misconfigured endpoint surfaces as a failed send
 * instead of a comment that silently never notified anyone.
 *
 * Providers with their own semantics (idempotency keys, batch endpoints,
 * webhooks) deserve their own adapter beside this one, not a branch inside it.
 */
export class HttpMailProvider implements MailProvider {
  constructor(
    private readonly config: HttpMailProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(input: {
    to: string;
    from?: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    // Addresses and the subject are header values wherever they end up. The
    // body is not touched here: it is HTML and belongs to the template, which
    // escapes it.
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      headers[sanitiseHeaderValue(key)] = sanitiseHeaderValue(value);
    }

    const response = await this.fetchImpl(this.config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.token
          ? { authorization: `Bearer ${this.config.token}` }
          : {}),
      },
      body: JSON.stringify({
        to: sanitiseHeaderValue(input.to),
        from: sanitiseHeaderValue(input.from ?? this.config.from),
        replyTo: input.replyTo ? sanitiseHeaderValue(input.replyTo) : undefined,
        subject: sanitiseHeaderValue(input.subject),
        html: input.html,
        text: input.text,
        headers,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Mail endpoint returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
  }
}
