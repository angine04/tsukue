import { describe, expect, it } from "vitest";
import { dictionaries, ui, uiFormat } from "./ui";
import type { UIKey } from "./ui/types";

/**
 * These exist because the dictionary has a failure mode the type system cannot
 * see: `UIDictionary` guarantees every key is *present* in every language, but
 * nothing guarantees the value is a real translation, or that its placeholders
 * match the syntax `uiFormat` substitutes. Both shipped broken once.
 */
describe("dictionaries", () => {
  const langs = Object.keys(dictionaries) as Array<keyof typeof dictionaries>;
  const englishKeys = Object.keys(dictionaries.en) as UIKey[];

  it("covers every language in the configured set", () => {
    expect(langs.sort()).toEqual(
      ["en", "ja", "ko", "zh-Hans", "zh-Hant"].sort(),
    );
  });

  it("has no empty value", () => {
    for (const lang of langs) {
      for (const key of englishKeys) {
        expect(dictionaries[lang][key]?.trim(), `${lang} → ${key}`).not.toBe(
          "",
        );
      }
    }
  });

  it("uses the same placeholders in every language", () => {
    // A translation that drops `{{status}}` renders a sentence with the value
    // missing, which is exactly the bug this catches.
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

    for (const key of englishKeys) {
      const expected = placeholders(dictionaries.en[key]);
      for (const lang of langs) {
        expect(
          placeholders(dictionaries[lang][key]),
          `${lang} → ${key}`,
        ).toEqual(expected);
      }
    }
  });

  it("never writes a placeholder in braces the formatter does not substitute", () => {
    // `uiFormat` substitutes `{{name}}`. A value written as `{name}` looks
    // right in review and renders the braces literally — every language doing
    // it consistently would satisfy the comparison above, which is why this is
    // a separate check on the syntax itself.
    for (const lang of langs) {
      for (const key of englishKeys) {
        const value = dictionaries[lang][key];
        if (!/\{[A-Za-z]/.test(value)) continue;
        expect(
          /\{\{\w+\}\}/.test(value),
          `${lang} → ${key}: "${value}" uses single braces, which uiFormat leaves alone`,
        ).toBe(true);
      }
    }
  });
});

describe("uiFormat", () => {
  it("substitutes a named placeholder", () => {
    expect(uiFormat("admin.nothingHere", "en", { status: "pending" })).toBe(
      "Nothing pending.",
    );
  });

  it("substitutes in every language that uses the key", () => {
    for (const lang of ["en", "zh-Hans", "zh-Hant", "ja", "ko"]) {
      const rendered = uiFormat("admin.nothingHere", lang, {
        status: "STATUS",
      });
      expect(rendered, lang).toContain("STATUS");
      expect(rendered, lang).not.toContain("{{");
    }
  });

  it("leaves single braces alone, so a value may contain one", () => {
    expect(uiFormat("admin.refresh", "en", { unused: "x" })).toBe("Refresh");
  });
});

describe("ui", () => {
  it("falls back to English for a language it does not have", () => {
    expect(ui("admin.refresh", "de")).toBe("Refresh");
  });

  it("falls back to the key itself rather than rendering nothing", () => {
    expect(ui("admin.refresh" as UIKey, "en")).toBe("Refresh");
  });
});
