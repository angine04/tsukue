import { describe, expect, it } from "vitest";
import { buildAlternates, type TranslatablePost } from "./alternates";

/**
 * hreflang grouping (AGENTS 6.2, and one of the unit tests AGENTS 20.1 asks
 * for by name). It is the part of the multilingual build that is easiest to get
 * quietly wrong: a missing alternate is invisible on the page and wrong for a
 * search engine, and x-default has to point somewhere or a reader whose
 * language has no version gets nothing.
 */
function entry(data: {
  lang: string;
  slug: string;
  translationKey: string;
}): TranslatablePost {
  return { data };
}

const english = entry({
  lang: "en",
  slug: "on-slowness",
  translationKey: "on-slowness-in-a-fast-world",
});
const simplified = entry({
  lang: "zh-Hans",
  slug: "slow-in-fast-world",
  translationKey: "on-slowness-in-a-fast-world",
});
const japanese = entry({
  lang: "ja",
  slug: "slowness-in-fast-world",
  translationKey: "on-slowness-in-a-fast-world",
});
const unrelated = entry({
  lang: "en",
  slug: "other",
  translationKey: "something-else",
});

const all = [english, simplified, japanese, unrelated];

describe("buildAlternates", () => {
  it("links every language version of the same post", () => {
    const alternates = buildAlternates(english, all);

    expect(alternates.map((link) => link.hreflang).sort()).toEqual([
      "en",
      "ja",
      "x-default",
      "zh-Hans",
    ]);
  });

  it("links the other languages from a translated version too, not only the source", () => {
    // A reader landing on the Japanese page should be able to reach the others,
    // which means the group is the translationKey and not the language.
    const alternates = buildAlternates(japanese, all);

    expect(alternates.map((link) => link.href)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/on-slowness"),
        expect.stringContaining("/zh-Hans/slow-in-fast-world"),
      ]),
    );
  });

  it("excludes posts that are not translations of this one", () => {
    const alternates = buildAlternates(english, all);

    expect(alternates.some((link) => link.href.includes("/other"))).toBe(false);
  });

  it("points x-default at the default language", () => {
    const xDefault = buildAlternates(japanese, all).find(
      (link) => link.hreflang === "x-default",
    );

    expect(xDefault?.href).toContain("/on-slowness");
    expect(xDefault?.href).not.toContain("/zh-Hans");
  });

  it("omits x-default when no version is in the default language", () => {
    // Better a missing x-default than one pointing at a language nobody
    // browsing for their own would accept.
    const alternates = buildAlternates(simplified, [simplified, japanese]);

    expect(alternates.map((link) => link.hreflang)).not.toContain("x-default");
  });

  it("uses absolute URLs, because these go in a document head", () => {
    for (const link of buildAlternates(english, all)) {
      expect(link.href).toMatch(/^https?:\/\//);
    }
  });
});
