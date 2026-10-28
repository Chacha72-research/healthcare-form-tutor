// The quiz, in the same one-task-per-screen style as the lessons. Questions
// go easiest first: either/or, yes/no, which word matches, fill in the blank.
// A teacher's link (?phase=pre or post) saves results for before/after checks.

import { useEffect, useState } from "react";
import type { Screen } from "../App";
import { getQuiz, saveQuizResult } from "../api";
import { Clip, ClipFace } from "../components/Clip";
import { Icon } from "../components/Icon";
import { LoadFailed, Loading } from "../components/Loading";
import { SayLine } from "../components/WordHero";
import { Bi, useLang } from "../i18n";
import { chimeDone, chimeRight, chimeWrong } from "../sounds";
import { sayEnglish, stopSpeaking } from "../speech";
import { markDone, recordQuiz } from "../storage";
import type { Quiz, TeacherParams } from "../types";

interface Props {
  termIds: string[];
  teacher: TeacherParams;
  go: (s: Screen) => void;
  nodeId?: string;
  big?: boolean;
}

type Answer = { term_id: string; type: string; correct: boolean };

const ASK: Record<string, string> = {
  either_or: "ask_either_or",
  yes_no: "ask_yes_no",
  meaning: "ask_which_word",
  fill: "ask_fill",
};

export function QuizScreen({ termIds, teacher, go, nodeId, big = false }: Props) {
  const { language, t } = useLang();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState(false);
  const [round, setRound] = useState(0);

  // A teacher's pre/post link fixes the words and the seed, so before and after match.
  const ids = termIds.length ? termIds : teacher.terms;
  const seed = teacher.seed ?? (teacher.phase === "practice" ? null : "class");

  useEffect(() => {
    setQuiz(null);
    setFailed(false);
    setStep(0);
    setPicked(null);
    setAnswers([]);
    setFinished(false);
    getQuiz(ids, seed, big ? 12 : 8)
      .then(setQuiz)
      .catch(() => setFailed(true));
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  if (failed || !quiz) {
    return (
      <main className="page" aria-busy={!failed}>
        {failed ? <LoadFailed onRetry={() => setRound((r) => r + 1)} /> : <Loading />}
      </main>
    );
  }

  const q = quiz.questions[step];
  const isLast = step + 1 >= quiz.total;
  const close = () => go({ name: "home" });

  function choose(optionId: string) {
    if (picked) return;
    setPicked(optionId);
    const right = optionId === q.answer_id;
    if (right) chimeRight();
    else chimeWrong();
    setAnswers((prev) => [...prev, { term_id: q.term_id, type: q.type, correct: right }]);
  }

  function next() {
    stopSpeaking();
    if (!isLast) {
      setPicked(null);
      setStep((i) => i + 1);
      return;
    }
    setFinished(true);
    chimeDone();
    recordQuiz(answers);
    if (nodeId) markDone(nodeId);
    saveQuizResult({ learner_code: teacher.learner, phase: teacher.phase, language: language.code, answers }).catch(() => {
      /* the learner still sees their score if saving fails */
    });
  }

  if (finished) {
    const score = answers.filter((a) => a.correct).length;
    const missed = [...new Set(answers.filter((a) => !a.correct).map((a) => a.term_id))];
    const labels = Object.fromEntries(quiz.questions.map((x) => [x.term_id, x.term]));
    return (
      <main className="lesson-screen lesson-finish">
        <ClipFace size={120} mood="cheer" />
        <h1 className="finish-title">
          <Bi k="your_score" />
        </h1>
        <p className="score" aria-live="polite">
          <span className="score-num">{score}</span>
          <span className="score-of">/ {quiz.total}</span>
        </p>
        <ol className="score-boxes" aria-hidden="true">
          {answers.map((a, i) => (
            <li key={i} className={a.correct ? "is-right" : "is-wrong"} />
          ))}
        </ol>
        {missed.length > 0 && (
          <section className="review-list">
            <h2>
              <Bi k="review_words" />
            </h2>
            <ul className="finish-words">
              {missed.map((id) => (
                <li key={id}>
                  <button type="button" className="tile" lang="en" onClick={() => sayEnglish(labels[id])}>
                    <Icon name="speaker" size={22} />
                    {labels[id]}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <footer className="lfoot lfoot-stack">
          <button type="button" className="btn btn-go btn-big" onClick={close}>
            <Bi k="continue" />
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setRound((r) => r + 1)}>
            <Icon name="replay" />
            <Bi k="try_again" />
          </button>
        </footer>
      </main>
    );
  }

  const correct = picked !== null && picked === q.answer_id;
  const answerLabel = q.type === "yes_no" ? t(q.answer_id) : (q.options.find((o) => o.id === q.answer_id)?.label ?? "");

  return (
    <main className="lesson-screen">
      <header className="lesson-top">
        <button type="button" className="lesson-x" onClick={close} aria-label={t("home")}>
          <Icon name="close" size={28} />
        </button>
        <span className="lesson-bar" aria-hidden="true">
          <span style={{ width: `${(100 * (step + (picked ? 1 : 0))) / quiz.total}%` }} />
        </span>
      </header>

      <section className="lesson-body" key={step}>
        <Clip k={ASK[q.type]} size={58} />
        <div className="task">
          {q.type === "yes_no" && (
            <p className="task-word" lang="en" dir="ltr">
              <span className="hl">{q.word}</span>
            </p>
          )}
          <SayLine text={q.prompt.replace(/_{3,}/g, "blank")} className="sayline-big">
            {q.prompt}
          </SayLine>
          <ul className="tiles">
            {q.options.map((o) => {
              const state = picked === null ? "" : o.id === q.answer_id ? " is-right" : o.id === picked ? " is-wrong" : " is-faded";
              return (
                <li key={o.id}>
                  <button type="button" className={`tile tile-big${state}`} onClick={() => choose(o.id)} disabled={picked !== null}>
                    {q.type === "yes_no" ? (
                      <Bi k={o.id} />
                    ) : (
                      <span lang="en" dir="ltr">
                        {o.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <footer className={`lfoot${picked ? (correct ? " is-right" : " is-wrong") : ""}`}>
        {picked && (
          <>
            <div className="lfoot-msg" role="status">
              <ClipFace size={52} mood={correct ? "cheer" : "happy"} />
              <div>
                {correct ? (
                  <Bi k="great_job" />
                ) : (
                  <>
                    <Bi k="not_quite" />
                    <strong className="lfoot-answer" lang="en" dir="ltr">
                      {answerLabel}
                    </strong>
                  </>
                )}
                <p className="lfoot-def" lang="en" dir="ltr">
                  <strong>{q.term}:</strong> {q.definition}
                </p>
              </div>
            </div>
            <button type="button" className={`btn btn-big ${correct ? "btn-go" : "btn-wrong"}`} onClick={next}>
              <Bi k={isLast ? "your_score" : "continue"} />
            </button>
          </>
        )}
      </footer>
    </main>
  );
}
