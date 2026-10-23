import { useEffect, useState } from "react";
import type { Screen } from "../App";
import { getQuiz, saveQuizResult } from "../api";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import { ENGLISH } from "../speech";
import type { Quiz, TeacherParams } from "../types";

interface Props {
  termIds: string[];
  teacher: TeacherParams;
  go: (s: Screen) => void;
}

type Answer = { term_id: string; type: string; correct: boolean };

export function QuizScreen({ termIds, teacher, go }: Props) {
  const { language, t } = useLang();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
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
    setIndex(0);
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

  const q = quiz.questions[index];
  const isLast = index + 1 >= quiz.total;

  function choose(optionId: string) {
    if (picked) return;
    setPicked(optionId);
    setAnswers((prev) => [...prev, { term_id: q.term_id, type: q.type, correct: optionId === q.answer_id }]);
  }

  function next() {
    if (!isLast) {
      setPicked(null);
      setIndex((i) => i + 1);
      window.scrollTo(0, 0);
      return;
    }
    setFinished(true);
    saveQuizResult({ learner_code: teacher.learner, phase: teacher.phase, language: language.code, answers }).catch(
      () => {
        /* the learner still sees their score if saving fails */
      },
    );
  }

  if (finished) {
    const score = answers.filter((a) => a.correct).length;
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
          <div className="actions">
            <button type="button" className="btn btn-primary btn-big" onClick={() => setRound((r) => r + 1)}>
              <Bi k="try_again" />
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => go({ name: "home" })}>
              <Icon name="home" />
              <Bi k="home" />
            </button>
          </div>
        </main>
      </>
    );
  }

  const correct = picked !== null && picked === q.answer_id;
  const answerLabel = q.options.find((o) => o.id === q.answer_id)?.label ?? "";
  const askKey = q.type === "meaning" ? "which_word" : "fill_blank";

  return (
    <>
      <TopBar go={go} />
      <main className="page quiz">
        <p className="progress">
          <span>{t("question_of", { n: index + 1, total: quiz.total })}</span>
          <span className="progress-track" aria-hidden="true">
            {quiz.questions.map((qq, i) => (
              <span key={qq.id} className={i < index ? "is-done" : i === index ? "is-now" : ""} />
            ))}
          </span>
        </p>

        <h1 className="quiz-ask">
          <Bi k={askKey} />
        </h1>

        <div className="prompt" lang="en" dir="ltr">
          <p>{q.prompt}</p>
          <ListenButton
            text={q.prompt.replace(/_{3,}/g, "blank")}
            voice={ENGLISH}
            slow
            label={t("listen")}
            size="lg"
          />
        </div>

        <ul className="choices" role="radiogroup" aria-label={t(askKey)}>
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
                  lang="en"
                  dir="ltr"
                >
                  <span className="choice-box" aria-hidden="true" />
                  <span className="choice-label">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {picked !== null && (
          <div className={`feedback ${correct ? "feedback-right" : "feedback-wrong"}`} role="status">
            <p className="feedback-head">
              {correct ? <Bi k="correct" /> : <Bi k="not_quite" />}
            </p>
            <div className="feedback-def" lang="en" dir="ltr">
              <p>
                <strong>{answerLabel}:</strong> {q.definition}
              </p>
              <ListenButton text={`${answerLabel}. ${q.definition}`} voice={ENGLISH} label={t("listen")} />
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
