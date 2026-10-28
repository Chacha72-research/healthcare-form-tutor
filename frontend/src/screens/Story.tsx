// A short "how it works" story: a few cards, each with one simple English
// sentence (said out loud) and a fuller explanation in the learner's own
// language, for adults. Then two easy either/or questions.

import { useEffect, useState } from "react";
import type { Screen } from "../App";
import { getConcept } from "../api";
import { Clip, ClipFace } from "../components/Clip";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { LoadFailed, Loading } from "../components/Loading";
import { SayLine } from "../components/WordHero";
import { Bi, BiText, useLang } from "../i18n";
import { chimeDone, chimeRight, chimeWrong } from "../sounds";
import { sayEnglish, stopSpeaking } from "../speech";
import { markDone } from "../storage";
import type { ConceptStory } from "../types";
import { Confetti, Tiles } from "./Lesson";

export function StoryScreen({ id, nodeId, go }: { id: string; nodeId: string; go: (s: Screen) => void }) {
  const { language, pick, t } = useLang();
  const [story, setStory] = useState<ConceptStory | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<{ right: boolean; answer: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setFailed(false);
    getConcept(id, language.code)
      .then(setStory)
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, [id, language.code, attempt]);

  const card = story && at < story.cards.length ? story.cards[at] : null;
  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => void sayEnglish(card.say, true), 400);
    return () => clearTimeout(timer);
  }, [card]);

  if (failed) {
    return (
      <main className="page">
        <LoadFailed onRetry={() => setAttempt((n) => n + 1)} />
      </main>
    );
  }
  if (!story) {
    return (
      <main className="page" aria-busy="true">
        <Loading />
      </main>
    );
  }

  const total = story.cards.length + story.checks.length;
  const check = card ? null : story.checks[at - story.cards.length];
  const close = () => {
    stopSpeaking();
    go({ name: "home" });
  };

  function next() {
    stopSpeaking();
    setResult(null);
    if (at + 1 < total) setAt(at + 1);
    else {
      setDone(true);
      chimeDone();
      markDone(nodeId);
    }
  }

  if (done) {
    return (
      <main className="lesson-screen lesson-finish">
        <Confetti />
        <ClipFace size={130} mood="cheer" />
        <h1 className="finish-title">
          <Bi k="story_done" />
        </h1>
        <p className="finish-sub">
          <BiText native={pick(story.title)} english={story.title.en} />
        </p>
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
        <button type="button" className="lesson-x" onClick={close} aria-label={t("home")}>
          <Icon name="close" size={28} />
        </button>
        <span className="lesson-bar" aria-hidden="true">
          <span style={{ width: `${(100 * (at + (result || card ? 1 : 0))) / total}%` }} />
        </span>
      </header>

      <section className="lesson-body" key={at}>
        <Clip k={card ? "clip_story" : "clip_check"} size={58} />
        {card ? (
          <div className="task story-card">
            <p className="story-title">
              <BiText native={pick(story.title)} english={story.title.en} />
            </p>
            <span className="story-icon" aria-hidden="true">
              <Icon name={card.icon} size={56} />
            </span>
            <SayLine text={card.say} className="sayline-big story-say" />
            {card.explain_l1 ? (
              <div className="helper helper-story">
                <p className="helper-big" lang={language.code}>
                  {card.explain_l1}
                </p>
                <ListenButton
                  parts={[{ text: card.explain_l1, lang: "l1", voice: "tutor", style: "tutor" }]}
                  label={t("listen")}
                  size="sm"
                />
              </div>
            ) : (
              <p className="helper-line" lang="en" dir="ltr">
                {card.explain}
              </p>
            )}
            <ol className="story-dots" aria-hidden="true">
              {story.cards.map((_, i) => (
                <li key={i} className={i === at ? "is-now" : i < at ? "is-done" : ""} />
              ))}
            </ol>
          </div>
        ) : (
          check && (
            <div className="task">
              <SayLine text={check.q} className="sayline-big" />
              {check.q_l1 && <p className="helper-line">{check.q_l1}</p>}
              <Tiles
                choices={check.options.map((o, i) => ({ id: o, label: o, sub: check.options_l1[i] }))}
                correctId={check.answer}
                result={result}
                onAnswer={(right, answer) => {
                  if (right) chimeRight();
                  else chimeWrong();
                  setResult({ right, answer });
                }}
              />
            </div>
          )
        )}
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
        ) : card ? (
          <button type="button" className="btn btn-go btn-big" onClick={next}>
            <Bi k="continue" />
          </button>
        ) : null}
      </footer>
    </main>
  );
}
