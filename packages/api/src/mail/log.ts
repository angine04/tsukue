import { createMailProvider, type MailProvider } from "@tsukue/mail";
import { encryptEmail, hashEmail, randomToken } from "../crypto.js";
import type { ApiEnv, D1Database } from "../env.js";

export const MAIL_CATEGORIES = [
  "admin_notification",
  "comment_reply",
  "newsletter",
  "subscription_confirmation",
] as const;

export type MailCategory = (typeof MAIL_CATEGORIES)[number];
export type MailSendStatus = "success" | "failure";

type MailMessage = Parameters<MailProvider["send"]>[0];

export interface MailLogEntry {
  id: string;
  category: MailCategory;
  provider: string;
  recipientEmailHash: string | null;
  status: MailSendStatus;
  error: string | null;
  createdAt: string;
}

export interface MailLogCounts {
  [status: string]: number | undefined;
}

export interface LoggedMailInput {
  category: MailCategory;
  /** Omitted when configuration prevents assembling a message. */
  message?: MailMessage;
  /** Why there is no message, when there is none. Recorded as the failure. */
  reason?: string;
}

interface MailLogRow {
  id: string;
  category: MailCategory;
  provider: string;
  email_hash: string | null;
  status: MailSendStatus;
  error: string | null;
  created_at: string;
}

/**
 * Sends one message and records the outcome at the same boundary for every
 * mail category. An absent provider is a failed attempt: otherwise a moderator
 * cannot distinguish an unsubscribe-bearing message that was skipped from one
 * that reached the provider.
 */
export async function sendLoggedMail(
  env: ApiEnv,
  input: LoggedMailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const providerName = env.MAIL_PROVIDER?.trim() || "unconfigured";
  const recipient = await recipientFields(env, input.message?.to);

  if (!input.message) {
    const message = input.reason ?? "Mail message could not be assembled.";
    await insertMailLog(env.DB, {
      category: input.category,
      provider: providerName,
      ...recipient,
      status: "failure",
      error: message,
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }

  let provider: MailProvider | undefined;
  try {
    provider = createMailProvider(env);
  } catch (error) {
    const message = String(error);
    await insertMailLog(env.DB, {
      category: input.category,
      provider: providerName,
      ...recipient,
      status: "failure",
      error: redactError(message, input.message),
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }

  if (!provider) {
    const message = "Mail provider is not configured.";
    await insertMailLog(env.DB, {
      category: input.category,
      provider: providerName,
      ...recipient,
      status: "failure",
      error: message,
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }

  try {
    await provider.send(input.message);
  } catch (error) {
    const message = String(error);
    await insertMailLog(env.DB, {
      category: input.category,
      provider: providerName,
      ...recipient,
      error: redactError(message, input.message),
      status: "failure",
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }

  await insertMailLog(env.DB, {
    category: input.category,
    provider: providerName,
    ...recipient,
    status: "success",
    error: null,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

/**
 * The address is useful for joining a send to a subscriber, but never belongs
 * in the moderator response. If either privacy primitive is unavailable, keep
 * neither representation rather than weakening the storage rule.
 */
async function recipientFields(
  env: ApiEnv,
  email: string | undefined,
): Promise<{
  recipientEmailHash: string | null;
  recipientEmailEncrypted: string | null;
}> {
  if (!email || !env.HASH_SALT || !env.EMAIL_ENCRYPTION_KEY) {
    return { recipientEmailHash: null, recipientEmailEncrypted: null };
  }
  try {
    const [recipientEmailHash, recipientEmailEncrypted] = await Promise.all([
      hashEmail(email, env.HASH_SALT),
      encryptEmail(email, env.EMAIL_ENCRYPTION_KEY),
    ]);
    return { recipientEmailHash, recipientEmailEncrypted };
  } catch {
    // A malformed key must not prevent recording why delivery failed.
    return { recipientEmailHash: null, recipientEmailEncrypted: null };
  }
}

function redactError(error: string, message: MailMessage | undefined): string {
  let safe = error;
  for (const value of [message?.to, message?.from]) {
    if (value) safe = safe.split(value).join("[redacted]");
  }
  return safe;
}

async function insertMailLog(
  db: D1Database,
  input: {
    category: MailCategory;
    provider: string;
    recipientEmailHash: string | null;
    recipientEmailEncrypted: string | null;
    status: MailSendStatus;
    error: string | null;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO mail_send_log
       (id, category, provider, email_hash,
        email_encrypted, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      randomToken(16),
      input.category,
      input.provider,
      input.recipientEmailHash,
      input.recipientEmailEncrypted,
      input.status,
      input.error,
      input.createdAt,
    )
    .run();
}
/** Most recent attempts first; bounded so a forgotten log cannot exhaust D1. */
export async function listMailSendLogs(
  db: D1Database,
  limit = 50,
): Promise<MailLogEntry[]> {
  const requestedLimit = Number.isFinite(limit) ? Math.floor(limit) : 50;
  const boundedLimit = Math.min(Math.max(requestedLimit, 1), 100);
  const result = await db
    .prepare(
      `SELECT id, category, provider, email_hash, status, error, created_at
       FROM mail_send_log
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(boundedLimit)
    .all<MailLogRow>();

  return result.results.map((row) => ({
    id: row.id,
    category: row.category,
    provider: row.provider,
    recipientEmailHash: row.email_hash,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
  }));
}

/** Counts by outcome, in the same shape as the moderation status counters. */
export async function countMailSendLogsByStatus(
  db: D1Database,
): Promise<MailLogCounts> {
  const result = await db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM mail_send_log
       GROUP BY status`,
    )
    .all<{ status: string; count: number }>();

  const counts: MailLogCounts = {};
  for (const row of result.results) counts[row.status] = row.count;
  return counts;
}
