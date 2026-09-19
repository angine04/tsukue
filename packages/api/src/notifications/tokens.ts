import { signPayload, verifyPayload } from "../crypto.js";

/**
 * What an unsubscribe link is allowed to say.
 *
 * - `thread` stops notifications about one conversation
 * - `all` stops every comment notification for this address
 *
 * AGENTS 15.5 asks for both links in every reply notification: a reader who is
 * done with one argument is not necessarily done with all of them, and offering
 * only the broad one makes leaving feel like an all-or-nothing decision.
 */
export type OptOutScope = "thread" | "all";

export interface OptOut {
  /** The address, hashed: the link must not name it. */
  emailHash: string;
  scope: OptOutScope;
  /** The thread's root comment. Empty for `all`, which names no thread. */
  threadId: string;
}

const SEPARATOR = "|";

/**
 * A token for one unsubscribe action.
 *
 * Signed rather than stored, so there is no table of pending unsubscribes to
 * keep, expire, or leak — and so a link that was never issued cannot be made to
 * look like one without the salt. The parts cannot contain the separator: a
 * hash is hex and a comment id is one of ours.
 */
export function optOutToken(optOut: OptOut, secret: string): Promise<string> {
  return signPayload(
    [optOut.emailHash, optOut.scope, optOut.threadId].join(SEPARATOR),
    secret,
  );
}

/** What a token claims, or nothing if it was not issued here. */
export async function readOptOutToken(
  token: string,
  secret: string,
): Promise<OptOut | null> {
  const payload = await verifyPayload(token, secret);
  if (!payload) return null;

  const [emailHash, scope, threadId] = payload.split(SEPARATOR);
  if (!emailHash) return null;
  if (scope !== "thread" && scope !== "all") return null;
  // A `thread` token that names no thread would read as every thread.
  if (scope === "thread" && !threadId) return null;

  return { emailHash, scope, threadId: threadId ?? "" };
}
