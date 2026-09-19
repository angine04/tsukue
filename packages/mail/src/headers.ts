/**
 * Strips what must never reach a mail header.
 *
 * A newline in a header value ends the header and starts another one, so a
 * value that carries `\r\n` can add recipients or rewrite the message's
 * routing. The slug in a notification subject is the realistic way that
 * arrives here, and callers are validated — but this is the layer that would
 * still hold if one of them stopped being.
 *
 * Other control characters go too: they are never intentional in a header and
 * some intermediaries mishandle them.
 *
 * ```
 * "New comment on x\r\nBcc: attacker@example.com"
 *   -> "New comment on x Bcc: attacker@example.com"
 * ```
 */
export function sanitiseHeaderValue(value: string): string {
  return (
    value
      .replace(/[\r\n]+/g, " ")
      // C0 controls and DEL, after the line breaks have become spaces. Matching
      // control characters is the purpose of this line, which is exactly what
      // the rule flags in ordinary code.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .trim()
  );
}

/**
 * The two headers that let a mailbox provider offer one-click unsubscribe
 * (AGENTS 15.8).
 *
 * `List-Unsubscribe` is the URL and `List-Unsubscribe-Post` says a provider may
 * follow it with a POST and no further interaction — which is what turns the
 * link into a button in Gmail and Outlook. The body such a provider posts is
 * the literal `List-Unsubscribe=One-Click`, so the endpoint behind this URL has
 * to accept a POST as well as a click.
 *
 * The URL is assembled from configuration and a random token rather than from
 * reader input, but it is flattened like any other header value: a header
 * assembled anywhere is one worth making single-line, and an angle bracket
 * would end the URL early in the form the spec requires.
 */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${sanitiseHeaderValue(url).replace(/[<>]/g, "")}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
