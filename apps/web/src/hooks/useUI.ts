import { useCallback } from "react";
import { ui, uiFormat, type UIKey } from "@angineblog/config";

export function useUI(lang: string = "en") {
  const t = useCallback(
    (key: UIKey) => ui(key, lang),
    [lang]
  );

  const tFormat = useCallback(
    (key: UIKey, replacements: Record<string, string | number>) =>
      uiFormat(key, lang, replacements),
    [lang]
  );

  return { t, tFormat, lang };
}
