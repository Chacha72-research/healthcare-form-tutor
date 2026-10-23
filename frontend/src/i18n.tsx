import { createContext, useContext } from "react";
import type { AppConfig, Language } from "./types";
import type { Voice } from "./speech";

interface LangContextValue {
  config: AppConfig;
  language: Language;
  voice: Voice;
  /** UI text in the learner's language (falls back to English) */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** The same UI text in English, shown small underneath as a learning aid */
  en: (key: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

function fill(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function makeLangValue(config: AppConfig, language: Language): LangContextValue {
  return {
    config,
    language,
    voice: { ttsLang: language.tts_lang, browserLang: language.browser_tts_lang },
    t: (key, vars) => fill(language.ui[key] ?? config.english_ui[key] ?? key, vars),
    en: (key, vars) => fill(config.english_ui[key] ?? key, vars),
  };
}

export const LangProvider = LangContext.Provider;

export function useLang() {
  const value = useContext(LangContext);
  if (!value) throw new Error("useLang must be inside LangProvider");
  return value;
}

/** Learner-language text with small English underneath. */
export function Bi({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const { t, en } = useLang();
  const native = t(k, vars);
  const english = en(k, vars);
  return (
    <span className="bi">
      <span className="bi-native">{native}</span>
      {english !== native && (
        <span className="bi-en" lang="en" dir="ltr">
          {english}
        </span>
      )}
    </span>
  );
}
