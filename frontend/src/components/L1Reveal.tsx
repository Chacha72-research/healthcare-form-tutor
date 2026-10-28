// The learner's language, folded away behind a small button so the screen
// stays simple and English-first. Tapping it shows the text and reads it aloud.

import { useState } from "react";
import { useLang } from "../i18n";
import { speak, stopSpeaking, unlockAudio } from "../speech";
import { Icon } from "./Icon";

export function L1Reveal({ text, startOpen = false }: { text: string | null | undefined; startOpen?: boolean }) {
  const { language } = useLang();
  const [open, setOpen] = useState(startOpen);
  if (!text) return null;

  const play = () => {
    unlockAudio();
    void speak({ text, lang: "l1", voice: "tutor", style: "tutor" });
  };

  return (
    <div className={`l1r${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="l1r-btn"
        aria-expanded={open}
        onClick={() => {
          if (open) stopSpeaking();
          else play();
          setOpen(!open);
        }}
      >
        <Icon name="globe" size={18} />
        <span>{language.native_name}</span>
      </button>
      {open && (
        <div className="l1r-body">
          <p lang={language.code}>{text}</p>
          <button type="button" className="l1r-say" onClick={play} aria-label="Listen">
            <Icon name="speaker" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
