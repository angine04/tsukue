/**
 * Escapes text for interpolation into an HTML template.
 *
 * Every template below puts values a person typed into an HTML document, so
 * every one of those values goes through here. A comment body is the obvious
 * case; a display name is the one that gets forgotten, and a name is a field
 * an attacker controls just as much as a body is.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes a value for a URL, not for HTML. Used for anything that lands in an
 * `href`, where HTML escaping is not enough — `javascript:` survives
 * `escapeHtml` intact, so the scheme is checked here and a value that is not
 * http(s) is dropped rather than linked.
 */
export function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "#";
    return escapeHtml(url.href);
  } catch {
    return "#";
  }
}
