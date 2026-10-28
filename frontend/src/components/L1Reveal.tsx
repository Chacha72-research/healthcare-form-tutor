// The learner's language, folded away behind a small button so the screen
// stays simple and English-first. With voice on (only lesson 1, to stay inside
// Gemini's voice limits), opening it also reads it aloud.

import { useState } from "react";
import { useLang } from "../i18n";
import { speak, stopSpeaking, unlockAudio } from "../speech";
import { Icon } from "./Icon";

interface Props {
  text: string | null | undefined;
  startOpen?: boolean;
  /** Read it aloud with Gemini's voice */
  voice?: boolean;
}

export function L1Reveal({ text, startOpen = false, voice = false }: Props) {
  const { language } = useLang();
  const [open, setOpen] = useState(startOpen);
  if (!text) return null;

  const play = () => {
    unlockAudio();
    void speak({ text, lang: "l1", voice: "tutor", style: "tutor", server: true });
  };

  return (
    <div className={`l1r${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="l1r-btn"
        aria-expanded={open}
        onClick={() => {
          if (open) stopSpeaking();
          else if (voice) play();
          setOpen(!open);
        }}
      >
        <Icon name="globe" size={18} />
        <span>{language.native_name}</span>
      </button>
      {open && (
        <div className="l1r-body">
          <p lang={language.code}>{text}</p>
          {voice && (
            <button type="button" className="l1r-say" onClick={play} aria-label="Listen">
              <Icon name="speaker" size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
