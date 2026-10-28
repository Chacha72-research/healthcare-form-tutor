// Practice speaking with a script, the way adult ESL classes practice a
// dialogue: the staff member's lines are read aloud (the browser's English
// voice), and on your turn you say your line into the mic. The app listens
// with the browser's speech recognition and shows which words came through.
// Hide your lines for a challenge: you see only your language and say it in
// English. Free talk with a live AI is offered at the end.

import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { getScenario } from "../api";
import { canListen, listenOnce, type Listening } from "../audio/listen";
import { Clip } from "../components/Clip";
import { FreeTalk } from "../components/FreeTalk";
import { Icon } from "../components/Icon";
import { InsuranceCard } from "../components/InsuranceCard";
import { LoadFailed, Loading } from "../components/Loading";
import { TopBar } from "../components/TopBar";
import { Bi, BiText, useLang } from "../i18n";
import { checkLine, type Check } from "../match";
import { sayEnglish, speakParts, stopSpeaking, unlockAudio } from "../speech";
import { markDone } from "../storage";
import type { ScenarioDetail } from "../types";

interface Result {
  passed: boolean;
  skipped?: boolean;
}

export function SpeakScreen({ id, nodeId, go }: { id: string; nodeId?: string; go: (s: Screen) => void }) {
  const { config, language, pick, t } = useLang();
  const [data, setData] = useState<ScenarioDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const [turn, setTurn] = useState(0);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [hideLines, setHideLines] = useState(false);
  const [showL1, setShowL1] = useState(true);
  const [mode, setMode] = useState<"script" | "free">("script");
  const spokenUpTo = useRef(-1);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFailed(false);
    getScenario(id, language.code)
      .then(setData)
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, [id, language.code, attempt]);

  const dialogue = data?.dialogue ?? [];
  const nextYou = (from: number) => {
    for (let i = from; i < dialogue.length; i++) if (dialogue[i].who === "you") return i;
    return dialogue.length;
  };

  // Read the staff member's new lines out loud (only if voice is on).
  useEffect(() => {
    if (!started || !data) return;
    const end = Math.min(turn, data.dialogue.length);
    const lines = [];
    for (let i = spokenUpTo.current + 1; i < end; i++) {
      if (data.dialogue[i].who === "staff") lines.push(data.dialogue[i].text);
    }
    spokenUpTo.current = Math.max(spokenUpTo.current, end - 1);
    if (lines.length) void speakParts(lines.map((text) => ({ text, lang: "en" as const, voice: "staff" as const })));
    const timer = setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    return () => clearTimeout(timer);
  }, [started, turn, data, round]);

  function start() {
    unlockAudio();
    stopSpeaking();
    spokenUpTo.current = -1;
    setResults({});
    setRound((r) => r + 1);
    setTurn(nextYou(0));
    setStarted(true);
    setMode("script");
  }

  function finishLine(i: number, result: Result) {
    setResults((r) => ({ ...r, [i]: result }));
    const next = nextYou(i + 1);
    setTurn(next);
    if (next >= dialogue.length && nodeId) markDone(nodeId);
  }

  if (failed || !data) {
    return (
      <>
        <TopBar go={go} />
        <main className="page" aria-busy={!failed}>
          {failed ? <LoadFailed onRetry={() => setAttempt((n) => n + 1)} /> : <Loading />}
        </main>
      </>
    );
  }

  const shown = started ? data.dialogue.slice(0, Math.min(turn + 1, data.dialogue.length)) : [];
  const done = started && turn >= data.dialogue.length;
  const yours = data.dialogue.map((d, i) => (d.who === "you" ? i : -1)).filter((i) => i >= 0);
  const said = yours.filter((i) => results[i]?.passed).length;
  const at = config.scenarios.findIndex((s) => s.id === id);
  const nextScenario = config.scenarios[at + 1];
  const listenable = canListen();

  return (
    <>
      <TopBar go={go} voiceToggle />
      <main className="page speak">
        <h1 className="screen-title">
          <BiText native={pick(data.title)} english={data.title.en} />
        </h1>
        <div className="goal">
          <span className="goal-label">{t("your_goal")}</span>
          <BiText native={pick(data.goal)} english={data.goal.en} />
        </div>

        <details className="card-details">
          <summary>
            <Icon name="card" size={24} />
            <Bi k="your_card" />
          </summary>
          <InsuranceCard />
        </details>

        {mode === "free" ? (
          <>
            <button type="button" className="back-link" onClick={() => setMode("script")}>
              <Icon name="back" size={20} />
              <span>{t("back_to_script")}</span>
            </button>
            <FreeTalk data={data} />
          </>
        ) : (
          <>
            {data.ai_error === "ai_busy" && <p className="notice">{t("ai_busy")}</p>}
            {!listenable && <p className="notice">{t("no_mic_support")}</p>}

            {!started ? (
              <div className="speak-start">
                <Clip k="speak_intro" />
                <button type="button" className="btn btn-go btn-big" onClick={start}>
                  <Icon name="mic" />
                  <Bi k="start" />
                </button>
              </div>
            ) : (
              <>
                <div className="speak-tools">
                  <button type="button" className="toggle" aria-pressed={hideLines} onClick={() => setHideLines((h) => !h)}>
                    {hideLines ? t("show_my_lines") : t("hide_my_lines")}
                  </button>
                  <button type="button" className="toggle" aria-pressed={!showL1} onClick={() => setShowL1((s) => !s)}>
                    {showL1 ? t("hide_meaning") : t("show_meaning")}
                  </button>
                </div>

                <ol className="script">
                  {shown.map((line, i) =>
                    line.who === "staff" ? (
                      <li key={`${round}-${i}`} className="sline sline-staff">
                        <span className="sline-who">{data.staff_label}</span>
                        <div className="sline-bubble">
                          <p lang="en" dir="ltr">
                            {line.text}
                          </p>
                          {showL1 && line.l1 && <p className="sline-l1">{line.l1}</p>}
                          <button
                            type="button"
                            className="sline-replay"
                            onClick={() => sayEnglish(line.text)}
                            aria-label={t("play_again")}
                          >
                            <Icon name="replay" size={18} />
                          </button>
                        </div>
                      </li>
                    ) : i === turn ? (
                      <li key={`${round}-${i}`} className="sline sline-you sline-now">
                        <YourTurn
                          text={line.text}
                          l1={line.l1}
                          hidden={hideLines}
                          showL1={showL1}
                          listenable={listenable}
                          onDone={(r) => finishLine(i, r)}
                        />
                      </li>
                    ) : (
                      <li key={`${round}-${i}`} className="sline sline-you">
                        <span className="sline-who">{t("you")}</span>
                        <div className={`sline-bubble${results[i]?.passed ? " is-right" : ""}`}>
                          <p lang="en" dir="ltr">
                            {line.text}
                          </p>
                          <span className="sline-badge">
                            {results[i]?.passed ? <Icon name="check" size={18} /> : t("skipped")}
                          </span>
                        </div>
                      </li>
                    ),
                  )}
                </ol>

                {done && (
                  <section className="speak-done" aria-live="polite">
                    <p className="score">
                      <span className="score-num">{said}</span>
                      <span className="score-of">/ {yours.length}</span>
                    </p>
                    <p className="speak-done-line">
                      <Bi k="lines_done" vars={{ n: said, total: yours.length }} />
                    </p>
                    <ol className="score-boxes" aria-hidden="true">
                      {yours.map((i) => (
                        <li key={i} className={results[i]?.passed ? "is-right" : "is-wrong"} />
                      ))}
                    </ol>
                    <div className="actions">
                      {!hideLines && (
                        <button
                          type="button"
                          className="btn btn-primary btn-big"
                          onClick={() => {
                            setHideLines(true);
                            start();
                          }}
                        >
                          <Icon name="mic" />
                          <Bi k="hide_my_lines" />
                        </button>
                      )}
                      <button type="button" className={`btn ${hideLines ? "btn-primary btn-big" : "btn-secondary"}`} onClick={start}>
                        <Icon name="replay" />
                        <Bi k="practice_again" />
                      </button>
                      {config.features.live && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            stopSpeaking();
                            setMode("free");
                          }}
                        >
                          <Icon name="chat" />
                          <Bi k="free_talk" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          go(nextScenario ? { name: "speak", id: nextScenario.id, nodeId: `talk:${nextScenario.id}` } : { name: "home" })
                        }
                      >
                        <Icon name="forward" />
                        <Bi k={nextScenario ? "next_situation" : "continue"} />
                      </button>
                    </div>
                  </section>
                )}
                <div ref={bottom} />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

interface TurnProps {
  text: string;
  l1: string | null;
  hidden: boolean;
  showL1: boolean;
  listenable: boolean;
  onDone: (r: Result) => void;
}

function YourTurn({ text, l1, hidden, showL1, listenable, onDone }: TurnProps) {
  const { t } = useLang();
  const [phase, setPhase] = useState<"ready" | "listening" | "checked">("ready");
  const [live, setLive] = useState("");
  const [heard, setHeard] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listening = useRef<Listening | null>(null);
  const finished = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      listening.current?.stop();
      window.clearTimeout(timer.current);
    },
    [],
  );

  function finish(r: Result) {
    if (finished.current) return;
    finished.current = true;
    window.clearTimeout(timer.current);
    listening.current?.stop();
    onDone(r);
  }

  async function listen() {
    if (phase === "listening") {
      listening.current?.stop();
      return;
    }
    stopSpeaking();
    unlockAudio();
    setError(null);
    setLive("");
    setCheck(null);
    setPhase("listening");
    const session = listenOnce(setLive);
    listening.current = session;
    const result = await session.done;
    listening.current = null;
    if (finished.current) return;
    if (result.error) {
      setError(result.error);
      setPhase("ready");
      return;
    }
    const c = checkLine(text, result.texts);
    setHeard(result.texts[0] ?? "");
    setCheck(c);
    setPhase("checked");
    if (c.passed) timer.current = window.setTimeout(() => finish({ passed: true }), 1600);
  }

  const showEnglish = !hidden || !l1 || check !== null;

  return (
    <div className={`yourturn${check ? (check.passed ? " is-right" : " is-wrong") : ""}`}>
      <p className="yourturn-label">
        <Bi k={hidden && l1 ? "your_turn_hidden" : "your_turn"} />
      </p>
      {hidden && l1 && <p className="yourturn-l1 yourturn-l1-big">{l1}</p>}
      {showEnglish && (
        <p className="yourturn-line" lang="en" dir="ltr">
          {check
            ? check.shown.map((w, j) => (
                <span key={j} className={w.heard ? "w-heard" : "w-missed"}>
                  {w.text}{" "}
                </span>
              ))
            : text}
        </p>
      )}
      {!hidden && showL1 && l1 && <p className="yourturn-l1">{l1}</p>}

      {phase === "listening" && (
        <p className="yourturn-live" lang="en" dir="ltr" aria-live="polite">
          {live || "..."}
        </p>
      )}
      {check && (
        <div className="yourturn-result" role="status">
          <p className="yourturn-verdict">
            {check.passed ? <Icon name="check" size={22} /> : null}
            <Bi k={check.passed ? "said_right" : "said_almost"} />
          </p>
          {!check.passed && heard && (
            <p className="yourturn-heard">
              <span>{t("we_heard")}</span>{" "}
              <q lang="en" dir="ltr">
                {heard}
              </q>
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="notice notice-bad" role="alert">
          {t(error)}
        </p>
      )}

      <div className="yourturn-controls">
        {listenable ? (
          <button
            type="button"
            className={`mic${phase === "listening" ? " is-on" : ""}`}
            onClick={check?.passed ? () => finish({ passed: true }) : listen}
          >
            <span className="mic-circle" aria-hidden="true">
              <Icon name={check?.passed ? "forward" : phase === "listening" ? "stop" : "mic"} size={34} />
            </span>
            <Bi
              k={
                check?.passed ? "next" : phase === "listening" ? "tap_to_stop" : check ? "try_again" : "tap_to_speak"
              }
            />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => finish({ passed: true })}>
            <Icon name="check" />
            <Bi k="i_said_it" />
          </button>
        )}
        <div className="yourturn-small">
          <button type="button" className="reply reply-quiet" onClick={() => sayEnglish(text, true)}>
            <Icon name="speaker" size={20} />
            <Bi k="hear_it" />
          </button>
          {!check?.passed && (
            <button type="button" className="reply reply-quiet" onClick={() => finish({ passed: false, skipped: true })}>
              <Bi k="skip" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
