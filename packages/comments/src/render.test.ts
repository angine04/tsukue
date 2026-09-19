import { describe, expect, it } from "vitest";
import { tokenizeCommentBody, tokenizeCommentLines } from "./render.js";

describe("tokenizeCommentBody", () => {
  it("leaves plain text alone", () => {
    expect(tokenizeCommentBody("just words")).toEqual([
      { type: "text", value: "just words" },
    ]);
  });

  it("lifts a URL out of the surrounding text", () => {
    expect(tokenizeCommentBody("see https://example.com/x for more")).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "https://example.com/x" },
      { type: "text", value: " for more" },
    ]);
  });

  it("handles a URL at the very start and very end", () => {
    expect(tokenizeCommentBody("https://a.test and https://b.test")).toEqual([
      { type: "link", value: "https://a.test" },
      { type: "text", value: " and " },
      { type: "link", value: "https://b.test" },
    ]);
  });

  it("only links http and https, because the rest are not links", () => {
    // The point of this test: these render as text, so no `javascript:` URL
    // can reach an href by way of a comment.
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      const tokens = tokenizeCommentBody(hostile);
      expect(tokens).toEqual([{ type: "text", value: hostile }]);
      expect(tokens.some((token) => token.type === "link")).toBe(false);
    }
  });

  it("does not swallow trailing punctuation into the link", () => {
    const tokens = tokenizeCommentBody("go to https://example.com.");
    expect(tokens[1]).toEqual({ type: "link", value: "https://example.com" });
  });

  it("keeps a URL with a query string whole", () => {
    const tokens = tokenizeCommentBody("https://example.com/a?b=1&c=2#d");
    expect(tokens).toEqual([
      { type: "link", value: "https://example.com/a?b=1&c=2#d" },
    ]);
  });

  it("preserves the original text exactly when reassembled", () => {
    const body = "line one\nhttps://example.com/x\nline three";
    const rejoined = tokenizeCommentBody(body)
      .map((token) => token.value)
      .join("");
    expect(rejoined).toBe(body);
  });
});

describe("tokenizeCommentLines", () => {
  it("splits on every line-ending style, since a body arrives from a textarea", () => {
    expect(tokenizeCommentLines("a\r\nb\rc\nd")).toHaveLength(4);
  });

  it("keeps a blank line as an empty line rather than dropping it", () => {
    expect(tokenizeCommentLines("a\n\nb")).toEqual([
      [{ type: "text", value: "a" }],
      [],
      [{ type: "text", value: "b" }],
    ]);
  });
});
