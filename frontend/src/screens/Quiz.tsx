import { useEffect, useState } from "react";
import type { Screen } from "../App";
import { WORDS_PER_LESSON } from "../App";
import { getQuiz, saveQuizResult } from "../api";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import { recordQuiz } from "../storage";
import type { FormReading, Quiz, TeacherParams } from "../types";

interface Props {
  termIds: string[];
  teacher: TeacherParams;
  go: (s: Screen) => void;
  /** Set when the quiz follows a lesson, so "next words" can continue the form */
  reading?: FormReading;
  index?: number;
}

type Answer = { term_id: string; type: string; correct: boolean };

const ASK: Record<string, string> = {
  either_or: "ask_either_or",
  yes_no: "ask_yes_no",
  meaning: "ask_which_word",
  fill: "ask_fill",
};

export function QuizScreen({ termIds, teacher, go, reading, index }: Props) {
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
    getQuiz(ids, seed)
      .then(setQuiz)
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  if (failed || !quiz) {
    return (
      <>
        <TopBar go={go} />
        <main className="page" aria-busy={!failed}>
          {failed && <p className="notice notice-bad">{t("error_generic")}</p>}
        </main>
      </>
    );
  }

  const q = quiz.questions[step];
  const isLast = step + 1 >= quiz.total;

  function choose(optionId: string) {
    if (picked) return;
    setPicked(optionId);
    setAnswers((prev) => [...prev, { term_id: q.term_id, type: q.type, correct: optionId === q.answer_id }]);
  }

  function next() {
    if (!isLast) {
      setPicked(null);
      setStep((i) => i + 1);
      window.scrollTo(0, 0);
      return;
    }
    setFinished(true);
    recordQuiz(answers);
    saveQuizResult({ learner_code: teacher.learner, phase: teacher.phase, language: language.code, answers }).catch(
      () => {
        /* the learner still sees their score if saving fails */
      },
    );
  }

  if (finished) {
    const score = answers.filter((a) => a.correct).length;
    const missed = [...new Set(answers.filter((a) => !a.correct).map((a) => a.term_id))];
    const labels = Object.fromEntries(quiz.questions.map((x) => [x.term_id, x.term]));
    const hasNext = reading && index !== undefined && (index + 1) * WORDS_PER_LESSON < reading.terms.length;
    return (
      <>
        <TopBar go={go} />
        <main className="page quiz-done">
          <h1 className="screen-title">
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
              <ul>
                {missed.map((id) => (
                  <li key={id} lang="en">
                    {labels[id]}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary btn-big"
              onClick={() => go({ name: "practice", suggested: [...new Set(answers.map((a) => a.term_id))] })}
            >
              <Icon name="chat" />
              <Bi k="practice_next" />
            </button>
            {hasNext && (
              <button type="button" className="btn btn-secondary" onClick={() => go({ name: "lesson", reading: reading!, index: index! + 1 })}>
                <Icon name="form" />
                <Bi k="next_lesson" />
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setRound((r) => r + 1)}>
              <Icon name="replay" />
              <Bi k="try_again" />
            </button>
          </div>
        </main>
      </>
    );
  }

  const correct = picked !== null && picked === q.answer_id;
  const answerLabel = q.options.find((o) => o.id === q.answer_id)?.label ?? "";
  const promptSpeech = q.type === "yes_no" ? `${q.word}. ${q.prompt}` : q.prompt.replace(/_{3,}/g, "blank");

  return (
    <>
      <TopBar go={go} voiceToggle />
      <main className="page quiz">
        <p className="progress">
          <span>{t("question_of", { n: step + 1, total: quiz.total })}</span>
          <span className="progress-track" aria-hidden="true">
            {quiz.questions.map((qq, i) => (
              <span key={qq.id} className={i < step ? "is-done" : i === step ? "is-now" : ""} />
            ))}
          </span>
        </p>

        <h1 className="quiz-ask">
          <Bi k={ASK[q.type]} />
        </h1>

        <div className="prompt" lang="en" dir="ltr">
          <div className="prompt-body">
            {q.type === "yes_no" && (
              <p className="prompt-word">
                <span className="hl">{q.word}</span> =
              </p>
            )}
            <p>{q.prompt}</p>
          </div>
          <ListenButton
            parts={[{ text: promptSpeech, lang: "en", voice: "tutor", style: "model" }]}
            label={t("listen")}
            size="lg"
          />
        </div>

        <ul className={`choices${q.options.length === 2 ? " choices-2" : ""}`} role="radiogroup" aria-label={t(ASK[q.type])}>
          {q.options.map((o) => {
            const state =
              picked === null ? "" : o.id === q.answer_id ? " is-right" : o.id === picked ? " is-wrong" : " is-faded";
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked === o.id}
                  className={`choice${state}`}
                  onClick={() => choose(o.id)}
                  disabled={picked !== null}
                >
                  <span className="choice-box" aria-hidden="true" />
                  {q.type === "yes_no" ? (
                    <Bi k={o.id} />
                  ) : (
                    <span className="choice-label" lang="en" dir="ltr">
                      {o.label}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {picked !== null && (
          <div className={`feedback ${correct ? "feedback-right" : "feedback-wrong"}`} role="status">
            <p className="feedback-head">
              {correct ? <Bi k="correct" /> : <Bi k="not_quite" />}
              {!correct && q.type !== "yes_no" && <strong lang="en"> {answerLabel}</strong>}
              {!correct && q.type === "yes_no" && <strong> {t(q.answer_id)}</strong>}
            </p>
            <div className="feedback-def" lang="en" dir="ltr">
              <p>
                <strong>{q.term}:</strong> {q.definition}
              </p>
              <ListenButton
                parts={[{ text: `${q.term}. ${q.definition}`, lang: "en", voice: "tutor", style: "model" }]}
                label={t("listen")}
              />
            </div>
            <button type="button" className="btn btn-primary btn-big" onClick={next}>
              <Bi k={isLast ? "your_score" : "next"} />
            </button>
          </div>
        )}
      </main>
    </>
  );
}
