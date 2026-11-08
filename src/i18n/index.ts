import { create } from "zustand";
import { en, DictKey } from "./en";
import { ru } from "./ru";
import { kk } from "./kk";

export type Lang = "en" | "ru" | "kk";
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "ru", label: "Русский", short: "RU" },
  { id: "kk", label: "Қазақша", short: "KZ" },
];

const dicts: Record<Lang, Partial<Record<DictKey, string>>> = { en, ru, kk };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("zg.lang") as Lang | null;
    if (saved && saved in dicts) return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "en").slice(0, 2);
  return nav === "ru" ? "ru" : nav === "kk" ? "kk" : "en";
}

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem("zg.lang", lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

export function translate(lang: Lang, key: DictKey, vars?: Record<string, string | number>) {
  let s = dicts[lang][key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: DictKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export type { DictKey };
