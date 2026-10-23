import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { conversationUrl } from "../api";
import { LiveConversation, type LiveStatus } from "../audio/live";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import type { Scenario } from "../types";

interface Line {
  role: "learner" | "partner";
  text: string;
}

export function Talk({ go }: { go: (s: Screen) => void }) {
  const { config, language, t } = useLang();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [status, setStatus] = useState<LiveStatus | "idle">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<LiveConversation | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => live.current?.stop(), []);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [lines]);

  if (!config.features.conversation) {
    return (
      <>
        <TopBar go={go} />
        <main className="page">
          <p className="notice">
            <Bi k="talk_unavailable" />
          </p>
        </main>
      </>
    );
  }

  async function start(s: Scenario) {
    setScenario(s);
    setLines([]);
    setError(null);
    const session = new LiveConversation({
      onStatus: setStatus,
      onTranscript: (role, text, newTurn) =>
        setLines((prev) => {
          if (newTurn || prev.length === 0) return [...prev, { role, text }];
          const copy = prev.slice();
          copy[copy.length - 1] = { role, text: copy[copy.length - 1].text + text };
          return copy;
        }),
      onError: (code) => setError(code),
    });
    live.current = session;
    await session.start(conversationUrl(s.id, language.code));
  }

  function end() {
    live.current?.stop();
    live.current = null;
  }

  const title = (s: Scenario) => s.title[language.code] ?? s.title.en;

  if (!scenario) {
    return (
      <>
        <TopBar go={go} />
        <main className="page talk">
          <h1 className="screen-title">
            <Bi k="choose_scenario" />
          </h1>
          <p className="hint-plain">{t("headphones_tip")}</p>
          <ul className="scenarios">
            {config.scenarios.map((s) => (
              <li key={s.id}>
                <button type="button" className="tile" onClick={() => start(s)}>
                  <span className="tile-icon">
                    <Icon name={s.icon} size={34} />
                  </span>
                  <span className="bi">
                    <span className="bi-native">{title(s)}</span>
                    {title(s) !== s.title.en && (
                      <span className="bi-en" lang="en">
                        {s.title.en}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </main>
      </>
    );
  }

  const active = status === "connecting" || status === "listening" || status === "speaking";
  const statusKey = status === "speaking" ? "speaking" : status === "listening" ? "listening" : "connecting";

  return (
    <>
      <TopBar go={go} />
      <main className="page talk-live">
        <h1 className="talk-title">{title(scenario)}</h1>

        {active && (
          <p className={`live-status live-${status}`} role="status">
            <span className="live-dot" aria-hidden="true" />
            {t(statusKey)}
          </p>
        )}

        {error && (
          <p className="notice notice-bad" role="alert">
            {error === "mic_denied" ? t("mic_denied") : error === "not_configured" ? t("talk_unavailable") : t("error_generic")}
          </p>
        )}

        <ol className="captions" lang="en" dir="ltr">
          {lines.map((line, i) => (
            <li key={i} className={`caption caption-${line.role}`}>
              {line.text}
            </li>
          ))}
        </ol>
        <div ref={bottom} />

        <div className="actions actions-sticky">
          {active ? (
            <button type="button" className="btn btn-stop btn-big" onClick={end}>
              <Icon name="stop" />
              <Bi k="end_talking" />
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-big" onClick={() => start(scenario)}>
                <Icon name="mic" />
                <Bi k="start_talking" />
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setScenario(null)}>
                <Icon name="back" />
                <Bi k="choose_scenario" />
              </button>
            </>
          )}
        </div>
      </main>
    </>
  );
}
