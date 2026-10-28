import { createContext, useContext } from "react";
import type { AppConfig, Language } from "./types";

type Vars = Record<string, string | number>;

interface LangContextValue {
  config: AppConfig;
  language: Language;
  /** UI text in the learner's language (falls back to English) */
  t: (key: string, vars?: Vars) => string;
  /** The same UI text in English, shown small underneath as a learning aid */
  en: (key: string, vars?: Vars) => string;
  /** Pick the learner's language from a {lang: text} map, falling back to English */
  pick: (map: Record<string, string>) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function makeLangValue(config: AppConfig, language: Language): LangContextValue {
  return {
    config,
    language,
    t: (key, vars) => fill(language.ui[key] ?? config.english_ui[key] ?? key, vars),
    en: (key, vars) => fill(config.english_ui[key] ?? key, vars),
    pick: (map) => map[language.code] ?? map.en ?? "",
  };
}

export const LangProvider = LangContext.Provider;

export function useLang() {
  const value = useContext(LangContext);
  if (!value) throw new Error("useLang must be inside LangProvider");
  return value;
}

/** Learner-language text with small English underneath. */
export function Bi({ k, vars }: { k: string; vars?: Vars }) {
  const { t, en } = useLang();
  return <BiText native={t(k, vars)} english={en(k, vars)} />;
}

export function BiText({ native, english }: { native: string; english?: string | null }) {
  // English first, so it reads clearly to anyone watching; the learner's language underneath as the helper.
  const { language } = useLang();
  const both = Boolean(english) && english !== native;
  return (
    <span className="bi">
      <span className="bi-native" lang={both ? "en" : language.code} dir={both ? "ltr" : undefined}>
        {both ? english : native}
      </span>
      {both && (
        <span className="bi-en" lang={language.code}>
          {native}
        </span>
      )}
    </span>
  );
}
