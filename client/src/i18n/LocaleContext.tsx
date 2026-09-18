import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";
import te from "./te.json";

export type Locale = "en" | "hi" | "mr" | "te";

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
];

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, hi, mr, te };

const STORAGE_KEY = "krishisetu_locale";

type TVars = Record<string, string | number>;

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: TVars) => string;
}

const LocaleContext = createContext<LocaleState | null>(null);

function interpolate(str: string, vars?: TVars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, name) => {
    const v = vars[name];
    return v === undefined ? match : String(v);
  });
}

function readInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi" || stored === "mr" || stored === "te") return stored;
  } catch {
    // localStorage unavailable — fall back to default
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore persistence failures (e.g. private browsing)
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: TVars): string => {
      const dict = DICTIONARIES[locale] || DICTIONARIES.en;
      // Never crash and never show a blank string: dictionary miss falls back to
      // English, and if English is missing too, fall back to the key itself.
      // A "__TODO__" placeholder (untranslated key) also falls back to English
      // so the demo never shows raw placeholder text mid-presentation.
      let raw = dict[key];
      if (!raw || raw === "__TODO__") raw = DICTIONARIES.en[key];
      if (!raw) raw = key;
      return interpolate(raw, vars);
    },
    [locale]
  );

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
