// One practice situation, taught the way adult ESL classes teach dialogues:
// 1. Listen to a model conversation (with the learner's language on request).
// 2. Check understanding, easiest questions first (either/or, yes/no, wh-).
// 3. Talk: role-play the situation out loud with a live AI partner,
//    reading from a pretend insurance card.

import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { conversationUrl, getScenario } from "../api";
import { LiveConversation, type LiveStatus } from "../audio/live";
import { Icon } from "../components/Icon";
import { LoadFailed, Loading } from "../components/Loading";
import { InsuranceCard } from "../components/InsuranceCard";
import { ListenButton } from "../components/ListenButton";
import { Marked } from "../components/Marked";
import { TopBar } from "../components/TopBar";
import { Bi, BiText, useLang } from "../i18n";
import { speakParts, stopSpeaking, unlockAudio, type SpeechPart } from "../speech";
import type { ScenarioDetail } from "../types";

type Step = "listen" | "check" | "talk";
const STEPS: Step[] = ["listen", "check", "talk"];

export function ScenarioScreen({ id, go }: { id: string; go: (s: Screen) => void }) {
  const { language, pick, t } = useLang();
  const [data, setData] = useState<ScenarioDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<Step>("listen");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    getScenario(id, language.code)
      .then(setData)
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, [id, language.code, attempt]);

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

  return (
    <>
      <TopBar go={go} voiceToggle />
      <main className="page scenario">
        <button type="button" className="back-link" onClick={() => go({ name: "practice" })}>
          <Icon name="back" size={20} />
          <span>{t("choose_situation")}</span>
        </button>
        <h1 className="screen-title">
          <BiText native={pick(data.title)} english={data.title.en} />
        </h1>
        <div className="goal">
          <span className="goal-label">{t("your_goal")}</span>
          <BiText native={pick(data.goal)} english={data.goal.en} />
        </div>

        <ol className="steps" role="tablist">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                role="tab"
                aria-selected={step === s}
                className={step === s ? "is-now" : STEPS.indexOf(step) > i ? "is-done" : ""}
                onClick={() => {
                  stopSpeaking();
                  setStep(s);
                }}
              >
                <span className="steps-num">{i + 1}</span>
                <Bi k={`step_${s}`} />
              </button>
            </li>
          ))}
        </ol>

        {data.ai_error === "ai_busy" && <p className="notice">{t("ai_busy")}</p>}

        {step === "listen" && <ListenStep data={data} onNext={() => setStep("check")} />}
        {step === "check" && <CheckStep data={data} onNext={() => setStep("talk")} />}
        {step === "talk" && <TalkStep data={data} />}
      </main>
    </>
  );
}

function lineSpeech(who: "staff" | "you", text: string): SpeechPart {
  return { text, lang: "en", voice: who === "staff" ? "staff" : "learner", style: "model" };
}

function ListenStep({ data, onNext }: { data: ScenarioDetail; onNext: () => void }) {
  const { t } = useLang();
  const [showL1, setShowL1] = useState(true);
  const [playing, setPlaying] = useState<number | null>(null);
  const stopRef = useRef(false);
  const termLabels = data.terms.map((x) => x.term);

  async function playAll() {
    unlockAudio();
    stopRef.current = false;
    for (let i = 0; i < data.dialogue.length; i++) {
      if (stopRef.current) break;
      setPlaying(i);
      const line = data.dialogue[i];
      await speakParts([lineSpeech(line.who, line.text)], true);
    }
    setPlaying(null);
  }

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  const hasL1 = data.dialogue.some((d) => d.l1);

  return (
    <section className="step-body">
      <ul className="term-chips" aria-label="Words">
        {data.terms.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              lang="en"
              title={x.definition}
              onClick={() => speakParts([{ text: x.term, lang: "en", voice: "tutor", style: "model" }], true)}
            >
              <Icon name="speaker" size={16} />
              {x.term}
            </button>
          </li>
        ))}
      </ul>

      <div className="dialogue-tools">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (playing !== null) {
              stopRef.current = true;
              stopSpeaking();
              setPlaying(null);
            } else void playAll();
          }}
        >
          <Icon name={playing !== null ? "stop" : "speaker"} />
          <Bi k={playing !== null ? "end_talking" : "play_all"} />
        </button>
        {hasL1 && (
          <button type="button" className="toggle" aria-pressed={showL1} onClick={() => setShowL1((s) => !s)}>
            {showL1 ? t("hide_meaning") : t("show_meaning")}
          </button>
        )}
      </div>

      <ol className="dialogue">
        {data.dialogue.map((line, i) => (
          <li key={i} className={`dline dline-${line.who}${playing === i ? " is-playing" : ""}`}>
            <span className="dline-who">{line.who === "staff" ? data.staff_label : t("you")}</span>
            <div className="dline-bubble">
              <p lang="en" dir="ltr">
                <Marked text={line.text} words={termLabels} />
              </p>
              {showL1 && line.l1 && <p className="dline-l1">{line.l1}</p>}
              <ListenButton parts={[lineSpeech(line.who, line.text)]} label={t("listen")} size="sm" />
            </div>
          </li>
        ))}
      </ol>
      {hasL1 && <p className="source-note">{t("ai_translation_note")}</p>}

      <Phrases data={data} />

      <button type="button" className="btn btn-primary btn-big" onClick={onNext}>
        <Bi k="step_check" />
      </button>
    </section>
  );
}

function Phrases({ data, compact = false }: { data: ScenarioDetail; compact?: boolean }) {
  const { t } = useLang();
  return (
    <section className={`phrases${compact ? " phrases-compact" : ""}`}>
      <h2>
        <Bi k="useful_phrases" />
      </h2>
      <ul>
        {data.useful_phrases.map((p) => (
          <li key={p.text}>
            <ListenButton parts={[lineSpeech("you", p.text)]} label={t("listen")} size="sm" />
            <span>
              <span lang="en" dir="ltr" className="phrase-en">
                {p.text}
              </span>
              {!compact && p.l1 && <span className="phrase-l1">{p.l1}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckStep({ data, onNext }: { data: ScenarioDetail; onNext: () => void }) {
  const { t } = useLang();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const q = data.questions[i];

  if (done) {
    return (
      <section className="step-body">
        <div className="bubble bubble-tutor bubble-feedback is-right">
          <p className="bubble-line">
            <Bi k="check_done" />
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-big" onClick={onNext}>
          <Icon name="mic" />
          <Bi k="step_talk" />
        </button>
      </section>
    );
  }

  const options =
    q.type === "yes_no"
      ? [
          { id: "yes", en: "Yes" },
          { id: "no", en: "No" },
        ]
      : q.options.map((o) => ({ id: o, en: o }));
  const answerId = q.type === "yes_no" ? (q.answer ? "yes" : "no") : String(q.answer);
  const askKey = q.type === "either_or" ? "ask_either_or" : q.type === "yes_no" ? "ask_yes_no" : "ask_wh";

  return (
    <section className="step-body">
      <p className="progress">
        <span>{t("question_of", { n: i + 1, total: data.questions.length })}</span>
      </p>
      <h2 className="quiz-ask">
        <Bi k={askKey} />
      </h2>
      <div className="prompt" lang="en" dir="ltr">
        <div className="prompt-body">
          <p>{q.q}</p>
          {q.q_l1 && (
            <p className="question-l1" dir="auto">
              {q.q_l1}
            </p>
          )}
        </div>
        <ListenButton parts={[{ text: q.q, lang: "en", voice: "tutor", style: "model" }]} label={t("listen")} size="lg" />
      </div>
      <ul className={`choices${options.length === 2 ? " choices-2" : ""}`}>
        {options.map((o, j) => {
          const state = picked === null ? "" : o.id === answerId ? " is-right" : o.id === picked ? " is-wrong" : " is-faded";
          return (
            <li key={o.id}>
              <button
                type="button"
                className={`choice${state}`}
                disabled={picked !== null}
                onClick={() => setPicked(o.id)}
              >
                <span className="choice-box" aria-hidden="true" />
                {q.type === "yes_no" ? <Bi k={o.id} /> : <BiText native={o.en} english={q.options_l1[j]} />}
              </button>
            </li>
          );
        })}
      </ul>
      {picked !== null && (
        <div className={`feedback ${picked === answerId ? "feedback-right" : "feedback-wrong"}`} role="status">
          <p className="feedback-head">{picked === answerId ? <Bi k="correct" /> : <Bi k="not_quite" />}</p>
          <button
            type="button"
            className="btn btn-primary btn-big"
            onClick={() => {
              setPicked(null);
              if (i + 1 < data.questions.length) setI(i + 1);
              else setDone(true);
            }}
          >
            <Bi k="next" />
          </button>
        </div>
      )}
    </section>
  );
}

interface Caption {
  role: "learner" | "partner";
  text: string;
}

function TalkStep({ data }: { data: ScenarioDetail }) {
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

  const active = status === "connecting" || status === "listening" || status === "speaking";
  const statusKey = status === "speaking" ? "speaking" : status === "listening" ? "listening" : "connecting";

  return (
    <section className="step-body talk">
      <div className="bubble bubble-tutor">
        <p className="bubble-line">
          <Bi k="talk_hint" vars={{ role: data.staff_label }} />
        </p>
      </div>

      <InsuranceCard />
      <Phrases data={data} compact />

      {!config.features.live ? (
        <p className="notice">{t("talk_unavailable")}</p>
      ) : (
        <>
          <p className="hint-plain">{t("headphones_tip")}</p>
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
              <button type="button" className="btn btn-primary btn-big" onClick={start}>
                <Icon name="mic" />
                <Bi k="start_talking" />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
