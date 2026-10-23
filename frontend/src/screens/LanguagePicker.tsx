import { ListenButton } from "../components/ListenButton";
import type { AppConfig } from "../types";

interface Props {
  config: AppConfig;
  current: string | null;
  onChoose: (code: string) => void;
}

export function LanguagePicker({ config, current, onChoose }: Props) {
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
            <ListenButton
              text={l.native_name}
              voice={{ ttsLang: l.tts_lang, browserLang: l.browser_tts_lang }}
              label={`${l.english_name}: listen`}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
