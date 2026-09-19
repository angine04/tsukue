import type { MailProvider } from "../provider.js";
import { HttpMailProvider } from "./http.js";

export interface MailEnv {
  MAIL_PROVIDER?: string;
  MAIL_ENDPOINT?: string;
  MAIL_TOKEN?: string;
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
 */
export function createMailProvider(
  env: MailEnv,
  fetchImpl?: typeof fetch,
): MailProvider | undefined {
  const name = env.MAIL_PROVIDER?.trim();
  if (!name) return undefined;

  if (name !== "http") {
    throw new Error(
      `Unknown MAIL_PROVIDER "${name}". Implement an adapter for it in @tsukue/mail rather than branching on the name here.`,
    );
  }

  if (!env.MAIL_ENDPOINT) {
    throw new Error('MAIL_PROVIDER is "http" but MAIL_ENDPOINT is not set.');
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
