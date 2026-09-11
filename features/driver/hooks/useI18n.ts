"use client";

import { useCallback, useEffect, useState } from "react";
import en from "../i18n/en.json";
import hi from "../i18n/hi.json";
import kn from "../i18n/kn.json";
import { getMeta, setMeta } from "../utils/queue-db";

export type Lang = "en" | "hi" | "kn";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "kn", label: "ಕನ್ನಡ" },
];

const DICTIONARIES: Record<Lang, Record<string, string>> = { en, hi, kn };
export type TranslationKey = keyof typeof en;

/**
 * Dictionary-based i18n. Adding a language is a JSON file plus one line in
 * LANGS — no code changes, which is what the PRD asks for.
 */
export function useI18n(initial: Lang = "en") {
  const [lang, setLangState] = useState<Lang>(initial);

  // The driver's choice is remembered on the device, not the server: the same
  // link may be opened by a relief driver who reads a different language.
  // Storage being unavailable (Safari Private Browsing, the same failure
  // useUploadQueue surfaces as dbError) must not crash this hook — the
  // driver just gets the requested `initial` language instead of a
  // remembered one, which is a fine fallback for a screen that offers
  // three explicit language buttons right at the top anyway.
  useEffect(() => {
    getMeta<Lang>("lang")
      .then((saved) => {
        if (saved && saved in DICTIONARIES) setLangState(saved);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    setMeta("lang", next).catch(() => {});
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => DICTIONARIES[lang][key] ?? DICTIONARIES.en[key] ?? key,
    [lang],
  );

  return { lang, setLang, t };
}
