// A short quiz inside a lesson page: the lesson's two "how it works"
// questions, then a few questions on its key words. One at a time, easiest first.

import { useEffect, useState } from "react";
import { getQuiz } from "../api";
import { Bi, useLang } from "../i18n";
import { chimeDone, chimeRight, chimeWrong } from "../sounds";
import type { ConceptStory } from "../types";
import { Tiles } from "../screens/Lesson";
import { Icon } from "./Icon";
import { Loading } from "./Loading";
import { SayLine } from "./WordHero";

interface Q {
  prompt: string;
  word?: string;
  choices: { id: string; label: string; sub?: string | null }[];
  answer: string;
  answerLabel: string;
}

export function MiniQuiz({ words, checks, onDone }: { words: string[]; checks: ConceptStory["checks"]; onDone: () => void }) {
  const { t } = useLang();
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<{ right: boolean; answer: string } | null>(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);

  useEffect(() => {
    setQuestions(null);
    setAt(0);
    setScore(0);
    setResult(null);
    const story: Q[] = checks.map((c) => ({
      prompt: c.q,
      choices: c.options.map((o, i) => ({ id: o, label: o, sub: c.options_l1[i] })),
      answer: c.answer,
      answerLabel: c.answer,
    }));
    getQuiz(words, null, 4)
      .then((quiz) => {
        const fromWords: Q[] = quiz.questions.map((q) => ({
          prompt: q.prompt,
          word: q.type === "yes_no" ? q.word : undefined,
          choices: q.options.map((o) => ({ id: o.id, label: q.type === "yes_no" ? t(o.id) : o.label })),
          answer: q.answer_id,
          answerLabel: q.type === "yes_no" ? t(q.answer_id) : (q.options.find((o) => o.id === q.answer_id)?.label ?? ""),
        }));
        setQuestions([...story, ...fromWords]);
      })
      .catch(() => setQuestions(story));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, checks, round]);

  if (!questions) return <Loading />;

  if (at >= questions.length) {
    return (
      <div className="mq-done">
        <p className="score">
          <span className="score-num">{score}</span>
          <span className="score-of">/ {questions.length}</span>
        </p>
        <p className="mq-done-line">
          <Bi k="quiz_done" vars={{ n: score, total: questions.length }} />
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => setRound((r) => r + 1)}>
          <Icon name="replay" />
          <Bi k="try_again" />
        </button>
      </div>
    );
  }

  const q = questions[at];
  return (
    <div className="mq" key={`${round}-${at}`}>
      <p className="mq-count">
        {at + 1} / {questions.length}
      </p>
      {q.word && (
        <p className="task-word" lang="en" dir="ltr">
          <span className="hl">{q.word}</span>
        </p>
      )}
      <SayLine text={q.prompt.replace(/_{3,}/g, "blank")} className="sayline-big">
        {q.prompt}
      </SayLine>
      <Tiles
        choices={q.choices}
        correctId={q.answer}
        result={result}
        onAnswer={(right, answer) => {
          if (right) chimeRight();
          else chimeWrong();
          if (right) setScore((s) => s + 1);
          setResult({ right, answer });
        }}
      />
      {result && (
        <div className={`mq-feedback ${result.right ? "is-right" : "is-wrong"}`} role="status">
          <span>
            {result.right ? (
              <Bi k="great_job" />
            ) : (
              <>
                <Bi k="not_quite" /> <strong lang="en">{q.answerLabel}</strong>
              </>
            )}
          </span>
          <button
            type="button"
            className={`btn ${result.right ? "btn-go" : "btn-wrong"}`}
            onClick={() => {
              setResult(null);
              if (at + 1 >= questions.length) {
                chimeDone();
                onDone();
              }
              setAt(at + 1);
            }}
          >
            <Bi k="continue" />
          </button>
        </div>
      )}
    </div>
  );
}
