import { describe, expect, it } from "vitest";
import { escapeHtml, safeUrl } from "./escape.js";
import { adminNotificationTemplate } from "./index.js";

describe("escapeHtml", () => {
  it("neutralises every character that could break out of a value", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;",
    );
  });
});

describe("safeUrl", () => {
  it("keeps http and https", () => {
    expect(safeUrl("https://example.test/admin")).toBe(
      "https://example.test/admin",
    );
  });

  it("refuses a scheme that would execute, which escaping alone does not stop", () => {
    // `javascript:` survives HTML escaping intact, so the href has to be
    // checked by scheme rather than merely encoded.
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
  });

  it("refuses something that is not a URL at all", () => {
    expect(safeUrl("not a url")).toBe("#");
  });
});

describe("adminNotificationTemplate", () => {
  it("cannot be made to carry markup from a comment", () => {
    const html = adminNotificationTemplate({
      commentAuthor: `<script>alert("x")</script>`,
      commentBody: `</blockquote><img src=x onerror="alert(1)">`,
      postSlug: "on-slowness",
      adminUrl: "https://example.test/admin",
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("still renders the values a moderator needs to read", () => {
    const html = adminNotificationTemplate({
      commentAuthor: "Ada",
      commentBody: "A thought.",
      postSlug: "on-slowness",
      adminUrl: "https://example.test/admin",
    });

    expect(html).toContain("Ada");
    expect(html).toContain("A thought.");
    expect(html).toContain('href="https://example.test/admin"');
  });

  it("does not let a hostile admin URL become a javascript: link", () => {
    const html = adminNotificationTemplate({
      commentAuthor: "Ada",
      commentBody: "x",
      postSlug: "on-slowness",
      adminUrl: "javascript:alert(1)",
    });
    expect(html).not.toContain("javascript:");
  });
});
