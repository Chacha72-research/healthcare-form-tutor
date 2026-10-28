// The big picture: how one doctor visit moves between You, the Clinic, and
// Insurance, one step at a time. Shown once after choosing a language, and
// always available at the top of the path. Each step has one easy English
// sentence (said out loud) and the full explanation in the learner's language.

import { useEffect, useState } from "react";
import type { Screen } from "../App";
import { getConcept } from "../api";
import { Clip, ClipFace } from "../components/Clip";
import { FlowDiagram, type FlowStep } from "../components/FlowDiagram";
import { Icon } from "../components/Icon";
import { L1Reveal } from "../components/L1Reveal";
import { LoadFailed, Loading } from "../components/Loading";
import { SayLine } from "../components/WordHero";
import { Bi, useLang } from "../i18n";
import { chimeDone } from "../sounds";
import { sayEnglish, stopSpeaking, unlockAudio } from "../speech";
import { markDone } from "../storage";
import type { ConceptStory } from "../types";

const SEEN_KEY = "form-helper-seen-big-picture";

export function seenBigPicture(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // can't remember it, so don't force it every visit
  }
}

function rememberSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* fine */
  }
}

export function BigPictureScreen({ go }: { go: (s: Screen) => void }) {
  const { language, t } = useLang();
  const [story, setStory] = useState<ConceptStory | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [at, setAt] = useState(0);

  useEffect(() => {
    setFailed(false);
    getConcept("big_picture", language.code)
      .then(setStory)
      .catch(() => setFailed(true));
    return () => stopSpeaking();
  }, [language.code, attempt]);

  const steps: FlowStep[] = (story?.cards ?? []).map((c) => ({ from: c.from!, to: c.to!, token: c.token ?? "" }));
  const card = story && at < story.cards.length ? story.cards[at] : null;

  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => void sayEnglish(card.say, true), 500);
    return () => clearTimeout(timer);
  }, [card]);

  function leave() {
    stopSpeaking();
    rememberSeen();
    go({ name: "home" });
  }

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

  const total = story.cards.length;
  const done = at >= total;

  return (
    <main className="lesson-screen bigpic">
      <header className="lesson-top">
        <button type="button" className="lesson-x" onClick={leave} aria-label={t("skip")}>
          <Icon name="close" size={28} />
        </button>
        <span className="lesson-bar" aria-hidden="true">
          <span style={{ width: `${(100 * Math.min(at + 1, total)) / total}%` }} />
        </span>
        {!done && (
          <button type="button" className="skip-link" onClick={leave}>
            {t("skip")}
          </button>
        )}
      </header>

      <section className="lesson-body" key={at}>
        {done ? (
          <>
            <div className="bigpic-done">
              <ClipFace size={84} mood="cheer" />
              <h1 className="finish-title">
                <Bi k="bp_done" />
              </h1>
            </div>
            <FlowDiagram steps={steps} current={total - 1} showAll />
            <ol className="bigpic-list">
              {story.cards.map((c, i) => (
                <li key={i}>
                  <span className="bigpic-num">{i + 1}</span>
                  <SayLine text={c.say} />
                </li>
              ))}
            </ol>
          </>
        ) : (
          card && (
            <>
              {at === 0 && <Clip k="clip_bigpicture" size={58} />}
              <p className="bigpic-step">
                <Bi k="bp_step" vars={{ n: at + 1, total }} />
              </p>
              <FlowDiagram steps={steps} current={at} />
              <SayLine text={card.say} className="sayline-big" />
              {card.explain_l1 ? (
              <L1Reveal text={card.explain_l1} />
            ) : (
                <p className="helper-line" lang="en" dir="ltr">
                  {card.explain}
                </p>
              )}
            </>
          )
        )}
      </section>

      <footer className="lfoot">
        <button
          type="button"
          className="btn btn-go btn-big"
          onClick={() => {
            unlockAudio();
            stopSpeaking();
            if (done) leave();
            else {
              if (at + 1 >= total) {
                chimeDone();
                markDone("big_picture");
              }
              setAt(at + 1);
            }
          }}
        >
          <Bi k={done ? "start_learning" : "continue"} />
        </button>
      </footer>
    </main>
  );
}
