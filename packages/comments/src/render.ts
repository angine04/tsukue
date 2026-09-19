export type CommentToken =
  | { type: "text"; value: string }
  | { type: "link"; value: string };

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

/**
 * Closing brackets that belong to the address only when it opened one. This is
 * what keeps the parenthesis in `https://en.wikipedia.org/wiki/Foo_(bar)` and
 * drops the one in `(see https://example.com)`.
 */
const BRACKET_PAIRS: ReadonlyArray<readonly [close: string, open: string]> = [
  [")", "("],
  ["]", "["],
  ["}", "{"],
];

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Separates an address from the punctuation that followed it in a sentence.
 *
 * A bare match takes the full stop with it, so `see https://example.com.`
 * would otherwise link `https://example.com.` and produce a broken address.
 * Everything removed is returned so it can be emitted as text, which is what
 * keeps the reassembled body byte-identical to the input.
 */
function splitTrailingPunctuation(match: string): {
  url: string;
  trailing: string;
} {
  let url = match;

  url = url.replace(/[.,;:!?]+$/, "");

  for (const [close, open] of BRACKET_PAIRS) {
    while (
      url.endsWith(close) &&
      occurrences(url, close) > occurrences(url, open)
    ) {
      url = url.slice(0, -1);
    }
  }

  url = url.replace(/["'`]+$/, "");

  return { url, trailing: match.slice(url.length) };
}

/**
 * Splits a comment body into text and link tokens.
 *
 * Tokens rather than an HTML string on purpose. A string would have to be
 * escaped by hand and then marked safe at the render site, which is the shape
 * every comment XSS takes; tokens let React escape the text itself and let the
 * only constructed markup be an anchor. Nothing here needs to know what the
 * output format is.
 *
 * Only `http` and `https` become links. `javascript:`, `data:` and the rest
 * are not matched, so they stay text.
 */
export function tokenizeCommentBody(body: string): CommentToken[] {
  const tokens: CommentToken[] = [];

  const push = (token: CommentToken) => {
    const last = tokens[tokens.length - 1];
    // Adjacent text merges, or the trailing punctuation above would leave the
    // output full of single-character tokens for no benefit to the renderer.
    if (token.type === "text" && last?.type === "text") {
      last.value += token.value;
      return;
    }
    tokens.push(token);
  };

  let cursor = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      push({ type: "text", value: body.slice(cursor, start) });
    }

    const { url, trailing } = splitTrailingPunctuation(match[0]);
    if (url) push({ type: "link", value: url });
    if (trailing) push({ type: "text", value: trailing });

    cursor = start + match[0].length;
  }

  if (cursor < body.length) {
    push({ type: "text", value: body.slice(cursor) });
  }

  return tokens;
}

/**
 * Splits into lines as well, because line breaks are the only formatting a
 * plain-text comment has and the renderer needs to know where they were.
 */
export function tokenizeCommentLines(body: string): CommentToken[][] {
  return body.split(/\r\n|\r|\n/).map(tokenizeCommentBody);
}
