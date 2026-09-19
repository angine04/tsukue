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
