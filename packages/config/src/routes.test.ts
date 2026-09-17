import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTE_CONFIG,
  aboutPath,
  homePath,
  localeSegments,
  postPartialSegments,
  postPath,
  postSegments,
  validateSlug,
} from "./routes";

const post = (slug: string, lang: string) => ({ slug, lang });

const prefixedConfig = {
  ...DEFAULT_ROUTE_CONFIG,
  postMode: "prefixed" as const,
};
const prefixedAll = {
  ...DEFAULT_ROUTE_CONFIG,
  localeMode: "prefixed-all" as const,
};

describe("postPath", () => {
  it("serves the default language from the site root", () => {
    expect(postPath(post("on-slowness", "en"))).toBe("/on-slowness");
  });

  it("prefixes non-default languages", () => {
    expect(postPath(post("slow-in-fast-world", "zh-Hans"))).toBe(
      "/zh-Hans/slow-in-fast-world",
    );
  });

  it("inserts the posts segment in prefixed mode", () => {
    expect(postPath(post("on-slowness", "en"), prefixedConfig)).toBe(
      "/posts/on-slowness",
    );
    expect(postPath(post("slow", "zh-Hans"), prefixedConfig)).toBe(
      "/zh-Hans/posts/slow",
    );
  });

  it("prefixes every language in prefixed-all mode", () => {
    expect(postPath(post("on-slowness", "en"), prefixedAll)).toBe(
      "/en/on-slowness",
    );
  });
});

describe("postPartialSegments", () => {
  it("keeps partials at the root for the default language", () => {
    expect(postPartialSegments(post("on-slowness", "en"))).toEqual([
      "partials",
      "on-slowness",
    ]);
  });

  it("puts the locale prefix in front of the reserved segment", () => {
    expect(postPartialSegments(post("slow-in-fast-world", "zh-Hans"))).toEqual([
      "zh-Hans",
      "partials",
      "slow-in-fast-world",
    ]);
  });
});

describe("postSegments", () => {
  it("drops the locale for the default language", () => {
    expect(postSegments(post("on-slowness", "en"))).toEqual(["on-slowness"]);
  });

  it("matches postPath", () => {
    for (const lang of ["en", "zh-Hans", "ja"]) {
      const segments = postSegments(post("some-post", lang));
      expect(postPath(post("some-post", lang))).toBe(`/${segments.join("/")}`);
    }
  });
});

describe("localeSegments", () => {
  it("is empty only for the default language in the default config", () => {
    expect(localeSegments("en")).toEqual([]);
    expect(localeSegments("ko")).toEqual(["ko"]);
  });
});

describe("aboutPath and homePath", () => {
  it("serves the default language flat", () => {
    expect(aboutPath()).toBe("/about");
    expect(homePath()).toBe("/");
  });

  it("prefixes other languages", () => {
    expect(aboutPath("ja")).toBe("/ja/about");
    expect(homePath("ja")).toBe("/ja");
  });
});

describe("validateSlug", () => {
  it("accepts kebab-case", () => {
    expect(validateSlug("on-slowness")).toBeUndefined();
    expect(validateSlug("post-2026")).toBeUndefined();
  });

  it("rejects reserved slugs, because article routes live at the root", () => {
    expect(validateSlug("about")).toMatch(/reserved/);
    expect(validateSlug("partials")).toMatch(/reserved/);
    expect(validateSlug("rss.xml")).toMatch(/reserved/);
  });

  it("rejects slugs that would not be safe in a URL", () => {
    expect(validateSlug("On Slowness")).toMatch(/kebab-case/);
    expect(validateSlug("on_slowness")).toMatch(/kebab-case/);
    expect(validateSlug("-leading")).toMatch(/kebab-case/);
  });
});
