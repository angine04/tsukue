export const SUPPORTED_LANGS = [
  "en",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
] as const;

export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: SupportedLang = "en";

export const LANG_LABELS: Record<SupportedLang, string> = {
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ja: "日本語",
  ko: "한국어",
};

export function isValidLang(lang: string): lang is SupportedLang {
  return SUPPORTED_LANGS.includes(lang as SupportedLang);
}

/**
 * A date as a reader of `lang` would write it.
 *
 * Rendered in UTC so a post dated `2026-05-28` reads as the 28th everywhere,
 * rather than shifting a day for readers behind the build machine.
 *
 * `lang` is passed explicitly rather than left to the browser: the same post
 * has a language, and a reader in Tokyo looking at the English version should
 * see the English date. Letting the browser choose makes one page render
 * differently for two people, which is also how a server/client mismatch
 * starts.
 *
 * Lives here rather than in the Astro app so the React islands can use it too;
 * `apps/web` re-exports it for the pages that already import it.
 */
export function formatDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}
