import type { Screen } from "../App";
import { useLang } from "../i18n";
import { stopSpeaking } from "../speech";
import { Icon } from "./Icon";

export function TopBar({ go, showHome = true }: { go: (s: Screen) => void; showHome?: boolean }) {
  const { language, t } = useLang();
  return (
    <header className="topbar">
      {showHome ? (
        <button type="button" className="topbar-btn" onClick={() => go({ name: "home" })} aria-label={t("home")}>
          <Icon name="home" size={24} />
          <span>{t("home")}</span>
        </button>
      ) : (
        <span className="topbar-title">{t("app_title")}</span>
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
        <span>{language.native_name}</span>
      </button>
    </header>
  );
}
