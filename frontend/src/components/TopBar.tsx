import { useState, type ReactNode } from "react";
import type { Screen } from "../App";
import { useLang } from "../i18n";
import { isVoiceOn, setVoiceOn, stopSpeaking } from "../speech";
import { Icon } from "./Icon";

interface Props {
  go: (s: Screen) => void;
  showHome?: boolean;
  /** Show the voice on/off switch (lessons and practice) */
  voiceToggle?: boolean;
  children?: ReactNode;
}

export function TopBar({ go, showHome = true, voiceToggle = false, children }: Props) {
  const { language, t, en } = useLang();
  const [voice, setVoice] = useState(isVoiceOn());

  return (
    <header className="topbar">
      {showHome ? (
        <button type="button" className="topbar-btn" onClick={() => go({ name: "home" })} aria-label={t("home")}>
          <Icon name="home" size={24} />
          <span className="topbar-label">{en("home")}</span>
        </button>
      ) : (
        <span className="topbar-title">{en("app_title")}</span>
      )}
      {children}
      <span className="topbar-right">
        {voiceToggle && (
          <button
            type="button"
            className="topbar-btn"
            aria-pressed={voice}
            onClick={() => {
              setVoiceOn(!voice);
              setVoice(!voice);
            }}
            aria-label={voice ? t("voice_on") : t("voice_off")}
            title={voice ? t("voice_on") : t("voice_off")}
          >
            <Icon name={voice ? "speaker" : "voiceoff"} size={24} />
          </button>
        )}
        <button
          type="button"
          className="topbar-btn"
          onClick={() => {
            stopSpeaking();
            go({ name: "language" });
          }}
          aria-label={t("change_language")}
        >
          <Icon name="globe" size={24} />
          <span className="topbar-label">{language.native_name}</span>
        </button>
      </span>
    </header>
  );
}
