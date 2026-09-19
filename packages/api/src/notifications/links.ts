import { SITE_URL } from "@tsukue/config";

/**
 * Where the notification endpoints live.
 *
 * Here rather than in the routes that serve them, for the same reason the
 * newsletter's links are: two files need the path — the routes register it, and
 * every reply notification puts it in an email — and a second copy would be a
 * second thing to keep in step.
 */
export const COMMENTS_API_BASE = "/api/comments";

/** An absolute link, because the only place it is used is an email. */
export function commentUnsubscribeUrl(token: string): string {
  return `${SITE_URL}${COMMENTS_API_BASE}/unsubscribe?token=${encodeURIComponent(token)}`;
}
