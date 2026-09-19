import { SITE_URL, postPath } from "@tsukue/config";
import {
  createMailProvider,
  replyNotificationTemplate,
  unsubscribeHeaders,
  type MailProvider,
} from "@tsukue/mail";
import { decryptEmail, hashEmail } from "../crypto.js";
import type { ApiEnv } from "../env.js";
import { getComment } from "../store.js";
import { commentUnsubscribeUrl } from "./links.js";
import { isOptedOut } from "./store.js";
import { optOutToken } from "./tokens.js";

/** What a notification needs to know about the reply that caused it. */
export interface PublishedReply {
  id: string;
  slug: string;
  lang?: string;
  parentId?: string;
  authorName: string;
  body: string;
}

/**
 * Tells the author of a comment that somebody replied to them.
 *
 * Never throws, and never changes the outcome of the request that called it. A
 * reply is already stored by the time this runs, and a mail failure that turned
 * a published reply into an error would hide it from the moderator while
 * keeping it in the database.
 *
 * Silent in every case where there is nothing to do: no mail configured, no
 * address on the parent comment, or the reader having asked not to be told.
 * Only a genuine failure is logged, because the noise otherwise buries it.
 */
export async function notifyReplyAuthor(
  env: ApiEnv,
  reply: PublishedReply,
): Promise<void> {
  // A top-level comment replies to nobody.
  if (!reply.parentId) return;

  const salt = env.HASH_SALT;
  const encryptionKey = env.EMAIL_ENCRYPTION_KEY;
  const from = env.MAIL_FROM ?? env.ADMIN_EMAIL;
  if (!salt || !encryptionKey || !from) return;

  let provider: MailProvider | undefined;
  try {
    provider = createMailProvider(env);
  } catch (error) {
    console.error(`Reply notification skipped: ${String(error)}`);
    return;
  }
  if (!provider) return;

  try {
    const parent = await getComment(env.DB, reply.parentId);
    if (!parent?.author_email_encrypted) return;

    // The thread is identified by its root, which is what a reply is stored
    // against, so unsubscribing from a conversation covers every branch of it.
    const threadId = parent.parent_id ?? parent.id;
    const to = await decryptEmail(parent.author_email_encrypted, encryptionKey);
    const emailHash = await hashEmail(to, salt);

    if (await isOptedOut(env.DB, { emailHash, threadId })) return;

    const threadUrl = commentUnsubscribeUrl(
      await optOutToken({ emailHash, scope: "thread", threadId }, salt),
    );
    const allUrl = commentUnsubscribeUrl(
      await optOutToken({ emailHash, scope: "all", threadId: "" }, salt),
    );

    await provider.send({
      to,
      from,
      subject: `New reply on ${reply.slug}`,
      html: replyNotificationTemplate({
        replyAuthor: reply.authorName,
        replyBody: reply.body,
        postSlug: reply.slug,
        postUrl: postUrlFor(reply),
        threadUnsubscribeUrl: threadUrl,
        allUnsubscribeUrl: allUrl,
      }),
      // The header offers the broad one: a mailbox provider's one-click button
      // reads as "stop sending me this kind of mail", and the narrower link is
      // in the body for a reader who wants only this thread to go quiet.
      headers: unsubscribeHeaders(allUrl),
    });
  } catch (error) {
    console.error(
      `Reply notification failed for ${reply.id}: ${String(error)}`,
    );
  }
}

/**
 * Where the reader can read the reply.
 *
 * Absolute, because it is going into an email, and built from the route helper
 * rather than from the request's own URL — the API never sees the page a
 * comment was made from.
 */
function postUrlFor(reply: PublishedReply): string {
  return `${SITE_URL}${postPath({ slug: reply.slug, lang: reply.lang ?? "en" })}`;
}
