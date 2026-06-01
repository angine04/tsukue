import { UIKey } from "./ui/types";
import { en } from "./ui/en";
import { zhHans } from "./ui/zh-Hans";
import { zhHant } from "./ui/zh-Hant";
import { ja } from "./ui/ja";
import { ko } from "./ui/ko";

export * from "./ui/types";

export const dictionaries = {
  en,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ja,
  ko,
};

export function ui(key: UIKey, lang: string = "en"): string {
  const dict =
    dictionaries[lang as keyof typeof dictionaries] ??
    dictionaries.en;
  return dict[key] ?? dictionaries.en[key] ?? key;
}

export function uiFormat(
  key: UIKey,
  lang: string = "en",
  replacements: Record<string, string | number>
): string {
  let text = ui(key, lang);
  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.replace(new RegExp(`{{${placeholder}}}`, "g"), String(value));
  }
  return text;
}

export function hasUILang(lang: string): boolean {
  return lang in dictionaries;
}
