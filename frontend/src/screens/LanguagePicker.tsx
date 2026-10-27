import { useState } from "react";
import { Icon } from "../components/Icon";
import { setLearnerBrowserLang, speak } from "../speech";
import type { AppConfig } from "../types";

interface Props {
  config: AppConfig;
  current: string | null;
  onChoose: (code: string) => void;
}

export function LanguagePicker({ config, current, onChoose }: Props) {
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <main className="page">
      <h1 className="picker-title">{config.english_ui.choose_language}</h1>
      <ul className="picker-prompts" aria-hidden="true">
        {config.languages.map((l) => (
          <li key={l.code} lang={l.code} dir={l.dir}>
            {l.ui.choose_language}
          </li>
        ))}
      </ul>

      <ul className="picker-list">
        {config.languages.map((l) => (
          <li key={l.code} className="picker-row">
            <button
              type="button"
              className={`picker-choice${current === l.code ? " is-current" : ""}`}
              onClick={() => onChoose(l.code)}
              lang={l.code}
              dir={l.dir}
            >
              <span className="picker-native">{l.native_name}</span>
              <span className="picker-english" lang="en">
                {l.english_name}
              </span>
            </button>
            <button
              type="button"
              className={`listen listen-md${playing === l.code ? " is-playing" : ""}`}
              aria-label={`${l.english_name}: listen`}
              onClick={async () => {
                setPlaying(l.code);
                // Each language says "Choose your language" in its own voice.
                setLearnerBrowserLang(l.browser_tts_lang);
                await speak({ text: l.ui.choose_language, lang: "l1" });
                setPlaying(null);
              }}
            >
              <Icon name="speaker" size={22} />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
