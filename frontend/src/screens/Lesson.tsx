// A short lesson on about 3 words, one small task per screen, like a
// language-learning app for beginners. Easiest first, following the adult ESL
// questioning hierarchy: meet the word and say it, then point to it on the
// paper, pick the word you hear, answer either/or, and use it in a sentence.
// A wrong answer just comes back once at the end. Nothing is ever lost.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Screen } from "../App";
import { getGlossary, getLesson } from "../api";
import { canListen, listenOnce, type Listening } from "../audio/listen";
import { Clip, ClipFace } from "../components/Clip";
import { Icon } from "../components/Icon";
import { InsuranceCard } from "../components/InsuranceCard";
import { L1Reveal } from "../components/L1Reveal";
import { LoadFailed, Loading } from "../components/Loading";
import { VoiceOrb } from "../components/VoiceOrb";
import { SayLine, WordHero } from "../components/WordHero";
import { Bi, useLang } from "../i18n";
import { checkLine } from "../match";
import { paperTerms } from "../path";
import { chimeDone, chimeRight, chimeWrong } from "../sounds";
import { sayEnglish, stopSpeaking, unlockAudio } from "../speech";
import { markDone, markLearned } from "../storage";
import type { LessonWord, Paper } from "../types";
import { PaperLine } from "./Explore";

interface Choice {
  id: string;
  term: string;
}

type Ex =
  | { kind: "meet"; w: LessonWord }
  | { kind: "say"; w: LessonWord }
  | { kind: "listen"; w: LessonWord; choices: Choice[] }
  | { kind: "find"; w: LessonWord }
  | { kind: "check"; w: LessonWord }
  | { kind: "tip"; w: LessonWord; choices: Choice[] }
  | { kind: "fill"; w: LessonWord; choices: Choice[]; blanked: string };

const CLIP: Record<Ex["kind"], string> = {
  meet: "clip_meet",
  say: "clip_say",
  listen: "clip_listen",
  find: "clip_find",
  check: "clip_check",
  tip: "clip_tip",
  fill: "clip_fill",
};

function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blankOut(w: LessonWord): string | null {
  const re = new RegExp(escapeRe(w.term).replace(/[-\s]/g, "[-\\s]?"), "i");
  return re.test(w.example) ? w.example.replace(re, "_____") : null;
}

function buildExercises(words: LessonWord[], extra: Choice[], canFind: (id: string) => boolean): Ex[] {
  const own = words.map((w) => ({ id: w.id, term: w.term }));
  const choicesFor = (w: LessonWord) => {
    const others = [...own, ...extra].filter((c, i, arr) => c.id !== w.id && arr.findIndex((x) => x.id === c.id) === i);
    return shuffle([{ id: w.id, term: w.term }, ...others.slice(0, 2)]);
  };
  const ex: Ex[] = [];
  for (const w of words) ex.push({ kind: "meet", w }, { kind: "say", w });
  words.forEach((w, i) =>
    ex.push(i % 2 === 1 && canFind(w.id) ? { kind: "find", w } : { kind: "listen", w, choices: choicesFor(w) }),
  );
  for (const w of words) ex.push({ kind: "check", w });
  const fill = words.find((w) => blankOut(w));
  if (fill) ex.push({ kind: "fill", w: fill, choices: choicesFor(fill), blanked: blankOut(fill)! });
  const tip = words.find((w) => w !== fill && w.tip && !w.tip.toLowerCase().includes(w.term.toLowerCase()));
  if (tip) ex.push({ kind: "tip", w: tip, choices: choicesFor(tip) });
  return ex;
}

interface Props {
  paper: Paper;
  words: string[];
  nodeId: string;
  go: (s: Screen) => void;
}

export function LessonScreen({ paper, words, nodeId, go }: Props) {
  const { language } = useLang();
  const [lessonWords, setLessonWords] = useState<LessonWord[] | null>(null);
  const [extra, setExtra] = useState<Choice[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    Promise.all([getLesson(words, language.code), getGlossary()])
      .then(([lesson, glossary]) => {
        setLessonWords(lesson.words);
        // Other words from the same paper make good wrong choices.
        const near = paperTerms(paper)
          .filter((t) => !words.includes(t.id))
          .map((t) => ({ id: t.id, term: t.term }));
        const far = glossary.filter((g) => !words.includes(g.id)).map((g) => ({ id: g.id, term: g.term }));
        setExtra(shuffle(near.length >= 2 ? near : far).slice(0, 6));
      })
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, [words, language.code, paper, attempt]);

  if (failed) {
    return (
      <main className="page">
        <LoadFailed onRetry={() => setAttempt((n) => n + 1)} />
      </main>
    );
  }
  if (!lessonWords) {
    return (
      <main className="page" aria-busy="true">
        <Loading />
      </main>
    );
  }
  return <LessonRun paper={paper} words={lessonWords} extra={extra} nodeId={nodeId} go={go} />;
}

function LessonRun({
  paper,
  words,
  extra,
  nodeId,
  go,
}: {
  paper: Paper;
  words: LessonWord[];
  extra: Choice[];
  nodeId: string;
  go: (s: Screen) => void;
}) {
  const canFind = (id: string) =>
    paper.kind === "card" ? true : Boolean(paper.reading?.lines.some((ln) => ln.marks.some((m) => m.term_id === id)));
  const first = useMemo(() => buildExercises(words, extra, canFind), [words, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const [queue, setQueue] = useState<Ex[]>(first);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<{ right: boolean; answer: string } | null>(null);
  const [done, setDone] = useState(false);
  const retried = useRef(new Set<Ex>());

  const ex = queue[at];

  function answer(right: boolean, answerText: string) {
    if (result) return;
    if (right) chimeRight();
    else chimeWrong();
    setResult({ right, answer: answerText });
    if (!right && !retried.current.has(ex)) {
      retried.current.add(ex);
      setQueue((q) => [...q, ex]);
    }
  }

  function next() {
    stopSpeaking();
    setResult(null);
    if (at + 1 < queue.length) setAt(at + 1);
    else {
      setDone(true);
      chimeDone();
      markDone(nodeId);
      markLearned(words.map((w) => w.id));
    }
  }

  function close() {
    stopSpeaking();
    go({ name: "home" });
  }

  if (done) {
    return (
      <main className="lesson-screen lesson-finish">
        <Confetti />
        <ClipFace size={130} mood="cheer" />
        <h1 className="finish-title">
          <Bi k="lesson_done" vars={{ n: words.length }} />
        </h1>
        <ul className="finish-words">
          {words.map((w) => (
            <li key={w.id}>
              <button type="button" className="tile" lang="en" onClick={() => sayEnglish(w.term)}>
                <Icon name="speaker" size={22} />
                {w.term}
              </button>
            </li>
          ))}
        </ul>
        <footer className="lfoot">
          <button type="button" className="btn btn-go btn-big" onClick={close}>
            <Bi k="continue" />
          </button>
        </footer>
      </main>
    );
  }

  return (
    <main className="lesson-screen">
      <header className="lesson-top">
        <button type="button" className="lesson-x" onClick={close} aria-label="Close">
          <Icon name="close" size={28} />
        </button>
        <span className="lesson-bar" aria-hidden="true">
          <span style={{ width: `${(100 * (at + (result ? 1 : 0))) / queue.length}%` }} />
        </span>
      </header>

      <section className="lesson-body" key={at}>
        <Clip k={paper.kind === "card" && ex.kind === "find" ? "clip_find_card" : CLIP[ex.kind]} size={58} />
        {ex.kind === "meet" && <Meet w={ex.w} />}
        {ex.kind === "say" && <Say w={ex.w} onPass={() => answer(true, ex.w.term)} />}
        {ex.kind === "listen" && <ListenPick w={ex.w} choices={ex.choices} result={result} onAnswer={answer} />}
        {ex.kind === "find" && <Find w={ex.w} paper={paper} result={result} onAnswer={answer} />}
        {ex.kind === "check" && <Check w={ex.w} result={result} onAnswer={answer} />}
        {ex.kind === "fill" && <Fill w={ex.w} choices={ex.choices} blanked={ex.blanked} result={result} onAnswer={answer} />}
        {ex.kind === "tip" && <Tip w={ex.w} choices={ex.choices} result={result} onAnswer={answer} />}
      </section>

      <footer className={`lfoot${result ? (result.right ? " is-right" : " is-wrong") : ""}`}>
        {result ? (
          <>
            <div className="lfoot-msg" role="status">
              <ClipFace size={52} mood={result.right ? "cheer" : "happy"} />
              <div>
                {result.right ? (
                  <Bi k="great_job" />
                ) : (
                  <>
                    <Bi k="not_quite" />
                    <strong className="lfoot-answer" lang="en" dir="ltr">
                      {result.answer}
                    </strong>
                  </>
                )}
              </div>
            </div>
            <button type="button" className={`btn btn-big ${result.right ? "btn-go" : "btn-wrong"}`} onClick={next}>
              <Bi k="continue" />
            </button>
          </>
        ) : ex.kind === "meet" ? (
          <button type="button" className="btn btn-go btn-big" onClick={next}>
            <Bi k="continue" />
          </button>
        ) : ex.kind === "say" ? (
          <button type="button" className="btn btn-quiet" onClick={next}>
            <Bi k="skip" />
          </button>
        ) : null}
      </footer>
    </main>
  );
}

/* ---------- The tasks ---------- */

function Meet({ w }: { w: LessonWord }) {
  return (
    <div className="task">
      <WordHero term={w.term} say={w.say} autoSay />
      <SayLine text={w.definition} className="sayline-big" />
      <L1Reveal text={w.l1.meaning} />
    </div>
  );
}

function Say({ w, onPass }: { w: LessonWord; onPass: () => void }) {
  const { t } = useLang();
  const [phase, setPhase] = useState<"ready" | "listening" | "heard">("ready");
  const [live, setLive] = useState("");
  const [heard, setHeard] = useState("");
  const [passed, setPassed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Listening | null>(null);
  const listenable = canListen();

  useEffect(() => () => session.current?.stop(), []);

  async function mic() {
    if (phase === "listening") {
      session.current?.stop();
      return;
    }
    stopSpeaking();
    unlockAudio();
    setError(null);
    setLive("");
    setPhase("listening");
    const s = listenOnce(setLive);
    session.current = s;
    const r = await s.done;
    session.current = null;
    if (r.error) {
      setError(r.error);
      setPhase("ready");
      return;
    }
    setHeard(r.texts[0] ?? "");
    setPhase("heard");
    if (checkLine(w.term, r.texts).passed) {
      setPassed(true);
      onPass();
    }
  }

  return (
    <div className="task">
      <WordHero term={w.term} say={w.say} />
      {listenable ? (
        <button type="button" className={`mic mic-big${phase === "listening" ? " is-on" : ""}`} onClick={mic} disabled={passed}>
          <VoiceOrb listening={phase === "listening"} size={112}>
            <span className="mic-circle" aria-hidden="true">
              <Icon name={phase === "listening" ? "stop" : "mic"} size={44} />
            </span>
          </VoiceOrb>
          <Bi k={phase === "listening" ? "tap_to_stop" : phase === "heard" && !passed ? "try_again" : "tap_to_speak"} />
        </button>
      ) : (
        <button type="button" className="btn btn-go btn-big" onClick={onPass}>
          <Icon name="check" />
          <Bi k="i_said_it" />
        </button>
      )}
      {phase === "listening" && (
        <p className="heard-live" lang="en" dir="ltr">
          {live || "..."}
        </p>
      )}
      {phase === "heard" && !passed && (
        <p className="heard">
          <span>{t("we_heard")}</span>{" "}
          <q lang="en" dir="ltr">
            {heard}
          </q>
        </p>
      )}
      {error && <p className="notice">{t(error)}</p>}
    </div>
  );
}

interface PickProps {
  result: { right: boolean } | null;
  onAnswer: (right: boolean, answer: string) => void;
}

export function Tiles({
  choices,
  correctId,
  onAnswer,
  result,
  speakOnTap = true,
}: PickProps & { choices: { id: string; label: string; sub?: string | null }[]; correctId: string; speakOnTap?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const correct = choices.find((c) => c.id === correctId)!;
  return (
    <ul className="tiles">
      {choices.map((c) => {
        const state = !picked ? "" : c.id === correctId ? " is-right" : c.id === picked ? " is-wrong" : " is-faded";
        return (
          <li key={c.id}>
            <button
              type="button"
              className={`tile tile-big${state}`}
              disabled={Boolean(picked) || Boolean(result)}
              onClick={() => {
                setPicked(c.id);
                if (speakOnTap) void sayEnglish(c.label);
                onAnswer(c.id === correctId, correct.label);
              }}
            >
              <span lang="en" dir="ltr">
                {c.label}
              </span>
              {c.sub && <span className="tile-sub">{c.sub}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ListenPick({ w, choices, result, onAnswer }: PickProps & { w: LessonWord; choices: Choice[] }) {
  useEffect(() => {
    const timer = setTimeout(() => void sayEnglish(w.term), 400);
    return () => clearTimeout(timer);
  }, [w.term]);
  return (
    <div className="task">
      <div className="big-listen">
        <button type="button" className="big-speaker" onClick={() => sayEnglish(w.term)} aria-label="Listen">
          <Icon name="speaker" size={56} />
        </button>
        <button type="button" className="big-speaker big-speaker-slow" onClick={() => sayEnglish(w.term, true)} aria-label="Slow">
          <Icon name="slow" size={36} />
        </button>
      </div>
      <Tiles
        choices={choices.map((c) => ({ id: c.id, label: c.term }))}
        correctId={w.id}
        result={result}
        onAnswer={onAnswer}
        speakOnTap={false}
      />
    </div>
  );
}

function Find({ w, paper, result, onAnswer }: PickProps & { w: LessonWord; paper: Paper }) {
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (id: string) => {
    if (picked || result) return;
    setPicked(id);
    onAnswer(id === w.id, w.term);
  };
  const lines = useMemo(() => {
    const all = paper.reading?.lines ?? [];
    const i = all.findIndex((ln) => ln.marks.some((m) => m.term_id === w.id));
    return all.slice(Math.max(0, i - 2), i + 3).filter((ln) => ln.marks.length);
  }, [paper, w.id]);

  return (
    <div className="task">
      <WordHero term={w.term} say={w.say} small autoSay />
      {paper.kind === "card" ? (
        <InsuranceCard onTap={pick} selected={picked} />
      ) : (
        <div className="formsheet formsheet-full formsheet-find" lang="en" dir="ltr">
          {lines.map((ln, j) => (
            <p key={j}>
              <PaperLine line={ln} yellow={ln.marks.map((m) => m.term_id)} onTap={pick} target={{ id: w.id, picked }} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Check({ w, result, onAnswer }: PickProps & { w: LessonWord }) {
  const q = w.check.either_or;
  return (
    <div className="task">
      <p className="task-word" lang="en" dir="ltr">
        <span className="hl">{w.term}</span>
      </p>
      <SayLine text={q.q} className="sayline-big" />
      {w.l1.either_or_q && <p className="helper-line">{w.l1.either_or_q}</p>}
      <Tiles
        choices={q.options.map((o, i) => ({ id: o, label: o, sub: w.l1.either_or_options[i] }))}
        correctId={q.answer}
        result={result}
        onAnswer={onAnswer}
      />
    </div>
  );
}

function Fill({ w, choices, blanked, result, onAnswer }: PickProps & { w: LessonWord; choices: Choice[]; blanked: string }) {
  const parts = blanked.split("_____");
  return (
    <div className="task">
      <p className="fill-sentence" lang="en" dir="ltr">
        {parts[0]}
        <span className="fill-blank">{result ? w.term : "?"}</span>
        {parts[1]}
      </p>
      {w.l1.example_meaning && <p className="helper-line">{w.l1.example_meaning}</p>}
      <Tiles choices={choices.map((c) => ({ id: c.id, label: c.term }))} correctId={w.id} result={result} onAnswer={onAnswer} />
    </div>
  );
}

function Tip({ w, choices, result, onAnswer }: PickProps & { w: LessonWord; choices: Choice[] }) {
  return (
    <div className="task">
      <div className="tip-field">
        <span className="tip-label" lang="en" dir="ltr">
          {result ? w.term : "?"}:
        </span>
        <span className="tip-line" />
      </div>
      <SayLine text={w.tip} />
      {w.l1.tip && <p className="helper-line">{w.l1.tip}</p>}
      <Tiles choices={choices.map((c) => ({ id: c.id, label: c.term }))} correctId={w.id} result={result} onAnswer={onAnswer} />
    </div>
  );
}

export function Confetti() {
  const colors = ["#ffe45c", "#2fb36d", "#3b82f6", "#ff7a59", "#a855f7", "#14b8a6"];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 9) * 0.12}s`,
            animationDuration: `${2.2 + (i % 5) * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
