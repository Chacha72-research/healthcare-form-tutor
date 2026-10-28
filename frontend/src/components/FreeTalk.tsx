// Free talk: no script. A live AI voice plays the staff member and the
// learner answers out loud, reading from the pretend insurance card.
// This is the one place that uses Gemini Live, and only when the learner asks.

import { useEffect, useRef, useState } from "react";
import { conversationUrl } from "../api";
import { LiveConversation, type LiveStatus } from "../audio/live";
import { Bi, useLang } from "../i18n";
import { stopSpeaking } from "../speech";
import type { ScenarioDetail } from "../types";
import { Icon } from "./Icon";

interface Caption {
  role: "learner" | "partner";
  text: string;
}

export function FreeTalk({ data }: { data: ScenarioDetail }) {
  const { config, language, t } = useLang();
  const [status, setStatus] = useState<LiveStatus | "idle">("idle");
  const [lines, setLines] = useState<Caption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<LiveConversation | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => live.current?.stop(), []);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [lines]);

  async function start() {
    stopSpeaking();
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
    await session.start(conversationUrl(data.id, language.code));
  }

  function end() {
    live.current?.stop();
    live.current = null;
  }

  if (!config.features.live) return <p className="notice">{t("talk_unavailable")}</p>;

  const active = status === "connecting" || status === "listening" || status === "speaking";
  const statusKey = status === "speaking" ? "speaking" : status === "listening" ? "listening" : "connecting";

  return (
    <section className="talk">
      <div className="bubble bubble-tutor">
        <p className="bubble-line">
          <Bi k="talk_hint" vars={{ role: data.staff_label }} />
        </p>
      </div>
      <p className="hint-plain">{t("headphones_tip")}</p>
      {active && (
        <p className={`live-status live-${status}`} role="status">
          {status === "connecting" ? (
            <span className="live-dot" aria-hidden="true" />
          ) : (
            <span className="live-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
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
          <button type="button" className="btn btn-primary btn-big" onClick={start}>
            <Icon name="mic" />
            <Bi k="start_talking" />
          </button>
        )}
      </div>
    </section>
  );
}
