import type { MailProvider } from "../provider.js";
import { HttpMailProvider } from "./http.js";
import { ResendMailProvider } from "./resend.js";

export interface MailEnv {
  /** Selects the adapter: `http` or `resend`. Unset means no mail is sent. */
  MAIL_PROVIDER?: string;
  /** Required by `http`: a JSON endpoint that accepts the message. */
  MAIL_ENDPOINT?: string;
  /** The credential, whatever the provider calls it — bearer token, API key. */
  MAIL_TOKEN?: string;
  /** The sender every provider needs, e.g. `Tsukue <comments@notify.example.com>`. */
  MAIL_FROM?: string;
}

/**
 * Builds the provider this deployment is configured for, or nothing.
 *
 * `undefined` means "no mail is configured", which is a legitimate state — a
 * local checkout, or a site that has not set up a sender yet. The caller
 * decides what to do about it, and for a comment notification the answer is to
 * log and carry on, because the comment is already stored and losing it to a
 * mail failure would be the worse outcome.
 *
 * A provider that is *named* but incomplete throws instead: that is a
 * misconfiguration, and it should be loud rather than silently skipping mail
 * that the operator believes is being sent.
 *
 * Which provider is a deployment's choice, and this is the whole of that
 * choice: all of them read the same three variables, so switching is a
 * configuration change. Adding one means an adapter file beside the others and
 * a branch here — not a branch inside an existing adapter.
 */
export function createMailProvider(
  env: MailEnv,
  fetchImpl?: typeof fetch,
): MailProvider | undefined {
  const name = env.MAIL_PROVIDER?.trim();
  if (!name) return undefined;

  switch (name) {
    case "http": {
      if (!env.MAIL_ENDPOINT) {
        throw new Error(
          'MAIL_PROVIDER is "http" but MAIL_ENDPOINT is not set.',
        );
      }
      if (!env.MAIL_FROM) {
        throw new Error('MAIL_PROVIDER is "http" but MAIL_FROM is not set.');
      }
      return new HttpMailProvider(
        {
          endpoint: env.MAIL_ENDPOINT,
          token: env.MAIL_TOKEN,
          from: env.MAIL_FROM,
        },
        fetchImpl,
      );
    }

    case "resend": {
      if (!env.MAIL_TOKEN) {
        throw new Error(
          'MAIL_PROVIDER is "resend" but MAIL_TOKEN is not set. For Resend it is the API key.',
        );
      }
      if (!env.MAIL_FROM) {
        throw new Error('MAIL_PROVIDER is "resend" but MAIL_FROM is not set.');
      }
      return new ResendMailProvider(
        { apiKey: env.MAIL_TOKEN, from: env.MAIL_FROM },
        fetchImpl,
      );
    }

    default: {
      // Deliberately not a place to add a provider: an adapter belongs in its
      // own file beside the others, so this stays a dispatch rather than
      // growing a branch per provider's quirks.
      throw new Error(
        `Unknown MAIL_PROVIDER "${name}". Implement an adapter for it in @tsukue/mail rather than branching on the name here.`,
      );
    }
  }
}
