// The English word, big, split into sounds, with Listen and Slow buttons.
// English uses the browser's own voice: instant and free.

import { useEffect, type ReactNode } from "react";
import { useLang } from "../i18n";
import { sayEnglish } from "../speech";
import { Icon } from "./Icon";

export function Syllables({ say }: { say: string }) {
  const words = say.split(/\s+/).filter(Boolean);
  return (
    <span className="syl" lang="en" dir="ltr" aria-hidden="true">
      {words.map((word, i) => {
        const parts = word.split("-");
        // Letters said one by one, like I-D or P-P-O, stay capitals.
        const letters = parts.every((p) => p.length === 1);
        return (
          <span key={i} className="syl-word">
            {parts.map((part, j) => (
              <span key={j} className={`syl-part${part === part.toUpperCase() && /[A-Z]/.test(part) ? " is-stress" : ""}`}>
                {letters ? part : part.toLowerCase()}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

export function WordHero({ term, say, autoSay = false, small = false }: { term: string; say: string; autoSay?: boolean; small?: boolean }) {
  const { t } = useLang();
  useEffect(() => {
    if (!autoSay) return;
    const timer = setTimeout(() => void sayEnglish(term, true), 350);
    return () => clearTimeout(timer);
  }, [term, autoSay]);

  return (
    <div className={`hero${small ? " hero-small" : ""}`}>
      <button type="button" className="hero-word" lang="en" dir="ltr" onClick={() => sayEnglish(term)}>
        <span className="hl">{term}</span>
      </button>
      <Syllables say={say} />
      <div className="hero-btns">
        <button type="button" className="icon-btn" onClick={() => sayEnglish(term)} aria-label={t("listen")} title={t("listen")}>
          <Icon name="speaker" size={26} />
        </button>
        <button type="button" className="icon-btn" onClick={() => sayEnglish(term, true)} aria-label={t("slow")} title={t("slow")}>
          <Icon name="slow" size={26} />
        </button>
      </div>
    </div>
  );
}

/** An English sentence you can tap to hear. */
export function SayLine({ text, className = "", children }: { text: string; className?: string; children?: ReactNode }) {
  return (
    <button type="button" className={`sayline ${className}`} lang="en" dir="ltr" onClick={() => sayEnglish(text, true)}>
      <Icon name="speaker" size={20} />
      <span>{children ?? text}</span>
    </button>
  );
}
