// The voice lesson. It follows the adult ESL lesson cycle used in California
// adult schools (warm-up, introduction, presentation, practice): a quick
// review, then for each word the tutor (1) introduces it, (2) has the learner
// find it on their own form, (3) explains it in their language, (4) models the
// English pronunciation for them to repeat, (5) shows it in a sentence, and
// (6) checks understanding with an either/or question and then a yes/no
// question, easiest first. The quiz and the practice situations come next.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Screen } from "../App";
import { WORDS_PER_LESSON } from "../App";
import { getLesson } from "../api";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { Marked } from "../components/Marked";
import { TopBar } from "../components/TopBar";
import { Bi, BiText, useLang } from "../i18n";
import { prefetch, speakParts, stopSpeaking, type SpeechPart } from "../speech";
import { markLearned, reviewWord } from "../storage";
import type { FormReading, Lesson, LessonWord } from "../types";

type Kind = "hello" | "goal" | "review" | "word" | "find" | "meaning" | "repeat" | "example" | "either_or" | "yes_no" | "next";

interface Beat {
  kind: Kind;
  word?: LessonWord;
  speech: SpeechPart[];
  last?: boolean;
}

const INTERACTIVE: Kind[] = ["find", "repeat", "either_or", "yes_no", "next"];

const en = (text: string): SpeechPart => ({ text, lang: "en", voice: "tutor", style: "model" });
const l1 = (text: string): SpeechPart => ({ text, lang: "l1", voice: "tutor", style: "tutor" });

interface Props {
  reading: FormReading;
  index: number;
  go: (s: Screen) => void;
}

export function LessonScreen({ reading, index, go }: Props) {
  const { language, t } = useLang();
  const totalLessons = Math.ceil(reading.terms.length / WORDS_PER_LESSON);
  const termIds = useMemo(
    () => reading.terms.slice(index * WORDS_PER_LESSON, (index + 1) * WORDS_PER_LESSON).map((x) => x.id),
    [reading, index],
  );
  const reviewId = useMemo(() => reviewWord(termIds), [termIds]);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showForm, setShowForm] = useState(() => window.innerWidth >= 960);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getLesson(reviewId ? [...termIds, reviewId] : termIds, language.code)
      .then(setLesson)
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, [termIds, reviewId, language.code]);

  const words = useMemo(() => lesson?.words.filter((w) => termIds.includes(w.id)) ?? [], [lesson, termIds]);
  const review = useMemo(() => lesson?.words.find((w) => w.id === reviewId) ?? null, [lesson, reviewId]);
  const formIds = useMemo(() => new Set(reading.terms.map((x) => x.id)), [reading]);

  const beats = useMemo<Beat[]>(() => {
    if (!words.length) return [];
    const list: Beat[] = [
      { kind: "hello", speech: [l1(t("tutor_hello"))] },
      { kind: "goal", speech: [l1(t("tutor_goal", { n: words.length }))] },
    ];
    if (review) {
      list.push({ kind: "review", word: review, speech: [l1(t("tutor_review")), en(review.term)] });
      list.push({ kind: "either_or", word: review, speech: [en(review.check.either_or.q)] });
    }
    words.forEach((w, i) => {
      const meaning = w.l1.meaning ? [l1(w.l1.meaning)] : [l1(t("tutor_no_meaning")), en(w.definition)];
      list.push(
        { kind: "word", word: w, speech: [l1(t("tutor_word", { word: w.term }))] },
        ...(formIds.has(w.id) ? [{ kind: "find" as Kind, word: w, speech: [l1(t("tutor_find"))] }] : []),
        { kind: "meaning", word: w, speech: meaning },
        {
          kind: "repeat",
          word: w,
          speech: [l1(t("tutor_say", { say: w.term })), en(w.term), en(w.term), l1(t("tutor_your_turn"))],
        },
        { kind: "example", word: w, speech: [l1(t("tutor_example")), en(w.example)] },
        { kind: "either_or", word: w, speech: [l1(t("tutor_check")), en(w.check.either_or.q)] },
        { kind: "yes_no", word: w, speech: [en(w.check.yes_no.q)] },
      );
      const last = i === words.length - 1;
      list.push({
        kind: "next",
        word: w,
        last,
        speech: [l1(last ? t("tutor_done", { n: words.length }) : t("tutor_next"))],
      });
    });
    return list;
  }, [words, review, formIds, t]);

  // Speak each new beat. Beats that need no answer move on by themselves.
  useEffect(() => {
    if (!started || revealed === 0) return;
    const i = revealed - 1;
    const beat = beats[i];
    if (!beat) return;
    let cancelled = false;
    prefetch(beats.slice(i + 1, i + 4).flatMap((b) => b.speech));
    void (async () => {
      await speakParts(beat.speech);
      if (cancelled) return;
      if (!INTERACTIVE.includes(beat.kind)) {
        await new Promise((r) => setTimeout(r, 350));
        if (!cancelled) setRevealed((r) => Math.max(r, i + 2));
      }
    })();
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    return () => {
      cancelled = true;
    };
  }, [revealed, started, beats]);

  useEffect(() => {
    if (beats.length && beats[revealed - 1]?.last) markLearned(words.map((w) => w.id));
  }, [revealed, beats, words]);

  function start() {
    setStarted(true);
    setRevealed(1);
  }

  async function answer(i: number, value: string, feedback?: string) {
    if (answers[i] !== undefined) return;
    setAnswers((a) => ({ ...a, [i]: value }));
    if (feedback) await speakParts([l1(feedback)]);
    setRevealed((r) => Math.max(r, i + 2));
  }

  if (failed) {
    return (
      <>
        <TopBar go={go} />
        <main className="page">
          <p className="notice notice-bad">{t("error_generic")}</p>
        </main>
      </>
    );
  }

  const current = beats[Math.max(0, revealed - 1)]?.word;
  const currentWordId = current && termIds.includes(current.id) ? current.id : null;
  const openFind = beats.findIndex((b, i) => i < revealed && b.kind === "find" && answers[i] === undefined);

  return (
    <>
      <TopBar go={go} voiceToggle />
      <div className="lesson-wrap">
        <aside className={`formpanel${showForm ? " is-open" : ""}`} aria-label={t("your_form")}>
          <button type="button" className="formpanel-toggle" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
            <Icon name="form" size={22} />
            <span>{t("your_form")}</span>
            <Icon name="back" size={18} />
          </button>
          {showForm && (
            <FormLines
              reading={reading}
              lessonIds={termIds}
              currentId={currentWordId}
              onFind={(id) => {
                if (openFind >= 0 && beats[openFind].word?.id === id) void answer(openFind, "found", t("tutor_right"));
              }}
            />
          )}
        </aside>

        <main className="page lesson">
          <div className="lesson-head">
            {totalLessons > 1 && <p className="lesson-count">{t("lesson_of", { n: index + 1, total: totalLessons })}</p>}
            <ol className="word-chips" aria-label={t("words_today", { n: words.length || termIds.length })}>
              {(words.length ? words : reading.terms.filter((x) => termIds.includes(x.id))).map((w) => {
                const pos = beats.findIndex((b) => b.word?.id === w.id && b.kind === "word");
                const state = currentWordId === w.id ? "is-now" : pos >= 0 && pos < revealed ? "is-done" : "";
                return (
                  <li key={w.id} className={state} lang="en">
                    {w.term}
                  </li>
                );
              })}
            </ol>
          </div>

          {lesson?.ai_error === "ai_busy" && <p className="notice">{t("ai_busy")}</p>}
          {lesson && !lesson.ai_available && <p className="notice">{t("ai_needs_key")}</p>}

          {!started && (
            <div className="lesson-start">
              <p className="lesson-start-count">
                <Bi k="words_today" vars={{ n: termIds.length }} />
              </p>
              <button type="button" className="btn btn-primary btn-big" onClick={start} disabled={!lesson}>
                <Icon name="speaker" />
                <Bi k="start" />
              </button>
            </div>
          )}

          <ol className="convo">
            {beats.slice(0, revealed).map((beat, i) => (
              <BeatView
                key={i}
                beat={beat}
                index={i}
                answer={answers[i]}
                onAnswer={answer}
                reading={reading}
                go={go}
                lessonIndex={index}
                nextLesson={index + 1 < totalLessons ? index + 1 : null}
                termIds={termIds}
              />
            ))}
          </ol>
          <div ref={bottom} />
        </main>
      </div>
    </>
  );
}

function Stressed({ say }: { say: string }) {
  // Capitals mark the stressed syllable: "de-DUC-ti-ble"
  return (
    <span className="say" lang="en" dir="ltr">
      {say.split(/(\s+|-)/).map((part, i) =>
        part === "-" ? (
          <span key={i} className="say-dot">
            ·
          </span>
        ) : /[A-Z]/.test(part) && part === part.toUpperCase() ? (
          <strong key={i}>{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

function Tutor({ k, vars, children, replay }: { k?: string; vars?: Record<string, string | number>; children?: ReactNode; replay?: SpeechPart[] }) {
  const { t } = useLang();
  return (
    <div className="bubble bubble-tutor">
      {k && (
        <p className="bubble-line">
          <Bi k={k} vars={vars} />
        </p>
      )}
      {children}
      {replay && (
        <button type="button" className="replay" onClick={() => speakParts(replay, true)} aria-label={t("play_again")}>
          <Icon name="replay" size={18} />
        </button>
      )}
    </div>
  );
}

function Me({ children }: { children: ReactNode }) {
  return <div className="bubble bubble-me">{children}</div>;
}

interface BeatProps {
  beat: Beat;
  index: number;
  answer: string | undefined;
  onAnswer: (i: number, value: string, feedback?: string) => void;
  reading: FormReading;
  go: (s: Screen) => void;
  lessonIndex: number;
  nextLesson: number | null;
  termIds: string[];
}

function BeatView({ beat, index, answer, onAnswer, reading, go, lessonIndex, nextLesson, termIds }: BeatProps) {
  const { t, en: enUi } = useLang();
  const w = beat.word;

  switch (beat.kind) {
    case "hello":
      return (
        <li>
          <Tutor k="tutor_hello" replay={beat.speech} />
        </li>
      );
    case "goal":
      return (
        <li>
          <Tutor k="tutor_goal" vars={{ n: termIds.length }} replay={beat.speech} />
        </li>
      );
    case "review":
    case "word":
      return (
        <li>
          <Tutor k={beat.kind === "review" ? "tutor_review" : undefined} replay={beat.kind === "word" ? beat.speech : undefined}>
            {beat.kind === "word" && (
              <p className="bubble-line">
                <BiText native={t("tutor_word", { word: w!.term })} english={enUi("tutor_word", { word: w!.term })} />
              </p>
            )}
            <div className="wordcard">
              <span className="hl hl-big" lang="en" dir="ltr">
                {w!.term}
              </span>
              <Stressed say={w!.say} />
              <ListenButton parts={[en(w!.term)]} label={`${w!.term}: ${t("listen")}`} tag="English" />
            </div>
          </Tutor>
        </li>
      );
    case "find": {
      const lines = reading.lines.filter((ln) => ln.marks.some((m) => m.term_id === w!.id)).slice(0, 2);
      return (
        <li>
          <Tutor k="tutor_find" replay={beat.speech}>
            <div className="snippet" lang="en" dir="ltr">
              <span className="snippet-label">{t("form_says")}</span>
              {lines.map((ln, j) => (
                <p key={j}>
                  <LineWithMarks
                    line={ln}
                    highlight={(id) => (id === w!.id ? "mk mk-current" : "")}
                    onTap={(id) => id === w!.id && onAnswer(index, "found", t("tutor_right"))}
                  />
                </p>
              ))}
            </div>
          </Tutor>
          {answer ? (
            <Me>
              <Icon name="check" size={20} /> {t("i_see_it")}
            </Me>
          ) : (
            <div className="replies">
              <button type="button" className="reply" onClick={() => onAnswer(index, "found", t("tutor_right"))}>
                <Bi k="i_see_it" />
              </button>
            </div>
          )}
        </li>
      );
    }
    case "meaning":
      return (
        <li>
          <Tutor replay={beat.speech}>
            {w!.l1.meaning ? (
              <>
                <p className="meaning">
                  <Marked text={w!.l1.meaning} words={[w!.term]} />
                </p>
                {!w!.l1.approved && <p className="source-note">{t("ai_translation_note")}</p>}
              </>
            ) : (
              <>
                <p className="bubble-line">{t("tutor_no_meaning")}</p>
                <p className="meaning" lang="en" dir="ltr">
                  {w!.definition}
                </p>
              </>
            )}
          </Tutor>
        </li>
      );
    case "repeat":
      return (
        <li>
          <Tutor replay={beat.speech}>
            <p className="bubble-line">
              <Bi k="tutor_say" vars={{ say: w!.say }} />
            </p>
            <div className="wordcard wordcard-say">
              <Stressed say={w!.say} />
            </div>
            <p className="bubble-line">
              <Bi k="tutor_your_turn" />
            </p>
          </Tutor>
          {answer ? (
            <Me>
              <span lang="en">{w!.term}</span> <Icon name="check" size={20} />
            </Me>
          ) : (
            <div className="replies">
              <button type="button" className="reply reply-quiet" onClick={() => speakParts([en(w!.term), en(w!.term)], true)}>
                <Icon name="replay" size={20} />
                <Bi k="play_again" />
              </button>
              <button type="button" className="reply" onClick={() => onAnswer(index, "said")}>
                <Bi k="i_said_it" />
              </button>
            </div>
          )}
        </li>
      );
    case "example":
      return (
        <li>
          <Tutor k="tutor_example" replay={beat.speech}>
            <p className="example" lang="en" dir="ltr">
              <Marked text={w!.example} words={[w!.term]} />
            </p>
            {w!.l1.example_meaning && <p className="example-l1">{w!.l1.example_meaning}</p>}
          </Tutor>
        </li>
      );
    case "either_or": {
      const q = w!.check.either_or;
      const right = (opt: string) => opt === q.answer;
      const answerL1 = w!.l1.either_or_options[q.options.indexOf(q.answer)] ?? q.answer;
      return (
        <li>
          <Tutor k={termIds.includes(w!.id) ? "tutor_check" : undefined} replay={beat.speech}>
            <p className="question" lang="en" dir="ltr">
              <span className="question-word">{w!.term}:</span> {q.q}
            </p>
            {w!.l1.either_or_q && <p className="question-l1">{w!.l1.either_or_q}</p>}
          </Tutor>
          {answer === undefined ? (
            <div className="replies replies-2">
              {q.options.map((opt, j) => (
                <button
                  key={opt}
                  type="button"
                  className="reply"
                  onClick={() =>
                    onAnswer(index, opt, right(opt) ? t("tutor_right") : t("tutor_wrong", { answer: answerL1 }))
                  }
                >
                  <BiText native={opt} english={w!.l1.either_or_options[j]} />
                </button>
              ))}
            </div>
          ) : (
            <Feedback me={answer} correct={right(answer)} answerText={q.answer} answerL1={answerL1} />
          )}
        </li>
      );
    }
    case "yes_no": {
      const q = w!.check.yes_no;
      const correctId = q.answer ? "yes" : "no";
      return (
        <li>
          <Tutor replay={beat.speech}>
            <p className="question" lang="en" dir="ltr">
              <span className="question-word">{w!.term}:</span> {q.q}
            </p>
            {w!.l1.yes_no_q && <p className="question-l1">{w!.l1.yes_no_q}</p>}
          </Tutor>
          {answer === undefined ? (
            <div className="replies replies-2">
              {(["yes", "no"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  className="reply"
                  onClick={() =>
                    onAnswer(index, id, id === correctId ? t("tutor_right") : t("tutor_wrong", { answer: t(correctId) }))
                  }
                >
                  <Bi k={id} />
                </button>
              ))}
            </div>
          ) : (
            <Feedback me={enUi(answer)} correct={answer === correctId} answerText={enUi(correctId)} answerL1={t(correctId)} />
          )}
        </li>
      );
    }
    case "next":
      return (
        <li>
          <Tutor
            k={beat.last ? "tutor_done" : "tutor_next"}
            vars={{ n: termIds.length }}
            replay={beat.speech}
          />
          {beat.last ? (
            <div className="lesson-end">
              {reading.unlisted.length > 0 && (
                <section className="ask-teacher">
                  <h2>{t("ask_teacher")}</h2>
                  <ul>
                    {reading.unlisted.map((x) => (
                      <li key={x} lang="en">
                        {x}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary btn-big"
                  onClick={() => go({ name: "quiz", termIds, reading, index: lessonIndex })}
                >
                  <Icon name="check" />
                  <Bi k="quiz_these" />
                </button>
                {nextLesson !== null && (
                  <button type="button" className="btn btn-secondary" onClick={() => go({ name: "lesson", reading, index: nextLesson })}>
                    <Icon name="form" />
                    <Bi k="next_lesson" />
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => go({ name: "practice", suggested: termIds })}>
                  <Icon name="chat" />
                  <Bi k="home_practice" />
                </button>
              </div>
            </div>
          ) : answer ? null : (
            <div className="replies">
              <button type="button" className="reply" onClick={() => onAnswer(index, "next")}>
                <Bi k="next" />
              </button>
            </div>
          )}
        </li>
      );
  }
}

function Feedback({ me, correct, answerText, answerL1 }: { me: string; correct: boolean; answerText: string; answerL1: string }) {
  const { t, en } = useLang();
  return (
    <>
      <Me>
        <span lang="en">{me}</span>
      </Me>
      <div className={`bubble bubble-tutor bubble-feedback ${correct ? "is-right" : "is-wrong"}`}>
        <p className="bubble-line">
          {correct ? (
            <BiText native={t("tutor_right")} english={en("tutor_right")} />
          ) : (
            <BiText native={t("tutor_wrong", { answer: answerL1 })} english={en("tutor_wrong", { answer: answerText })} />
          )}
        </p>
      </div>
    </>
  );
}

function LineWithMarks({
  line,
  highlight,
  onTap,
}: {
  line: { text: string; marks: { start: number; end: number; term_id: string }[] };
  highlight: (id: string) => string;
  onTap?: (id: string) => void;
}) {
  const out: ReactNode[] = [];
  let last = 0;
  line.marks.forEach((m, j) => {
    if (m.start > last) out.push(line.text.slice(last, m.start));
    const cls = highlight(m.term_id);
    const text = line.text.slice(m.start, m.end);
    out.push(
      cls ? (
        <button key={j} type="button" className={cls} onClick={() => onTap?.(m.term_id)}>
          {text}
        </button>
      ) : (
        <span key={j}>{text}</span>
      ),
    );
    last = m.end;
  });
  out.push(line.text.slice(last));
  return <>{out}</>;
}

function FormLines({
  reading,
  lessonIds,
  currentId,
  onFind,
}: {
  reading: FormReading;
  lessonIds: string[];
  currentId: string | null;
  onFind: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector(".mk-current")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentId]);
  return (
    <div className="formsheet" ref={box} lang="en" dir="ltr">
      {reading.lines.map((ln, i) => (
        <p key={i}>
          <LineWithMarks
            line={ln}
            highlight={(id) => (id === currentId ? "mk mk-current" : lessonIds.includes(id) ? "mk mk-lesson" : "mk mk-other")}
            onTap={onFind}
          />
        </p>
      ))}
    </div>
  );
}
