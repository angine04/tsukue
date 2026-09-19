import { SITE_URL } from "@tsukue/config";

/**
 * Where the newsletter endpoints live.
 *
 * Here rather than inside the routes that serve them, because two files build
 * links to them: subscribing builds the confirmation link, and the admin send
 * builds the unsubscribe link that goes into every newsletter. A second copy of
 * this path would be a second thing to keep in step with the route table.
 */
const API_BASE = "/api/newsletter";

/** An absolute link, because the only place either of these is used is an email. */
export function newsletterLink(
  path: "/confirm" | "/unsubscribe",
  token: string,
): string {
  return `${SITE_URL}${API_BASE}${path}?token=${encodeURIComponent(token)}`;
}
