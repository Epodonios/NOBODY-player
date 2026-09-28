// ── hooks: translation + accent ──────────────────────────────────────────────

import { useCallback } from "react";
import { DICTS } from "../i18n";
import type { DictKey } from "../i18n";
import { useSettings } from "../store/settings";

export function useT() {
  const lang = useSettings((s) => s.lang);
  return useCallback(
    (k: DictKey | string): string => DICTS[lang][k as DictKey] ?? DICTS.en[k as DictKey] ?? k,
    [lang]
  );
}

export const tStatic = (lang: keyof typeof DICTS, k: string) =>
  DICTS[lang][k as DictKey] ?? DICTS.en[k as DictKey] ?? k;
