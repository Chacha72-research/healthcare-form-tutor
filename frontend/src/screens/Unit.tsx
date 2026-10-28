// One lesson, on one page. Left: Learn (a short "how it works" story and 4
// key words, English first, the learner's language one tap away). Right:
// Practice (say a real conversation out loud, or take a short quiz). On a
// phone, Practice sits under Learn.

import { useEffect, useState } from "react";
import type { Screen } from "../App";
import { getConcept, getExplain, getGlossary } from "../api";
import { Icon } from "../components/Icon";
import { L1Reveal } from "../components/L1Reveal";
import { LoadFailed, Loading } from "../components/Loading";
import { MiniQuiz } from "../components/MiniQuiz";
import { TopBar } from "../components/TopBar";
import type { L1 } from "../components/WordCard";
import { SayLine, Syllables } from "../components/WordHero";
import { Bi, BiText, useLang } from "../i18n";
import { partId, type LessonUnit, type Part } from "../path";
import { sayEnglish, stopSpeaking } from "../speech";
import { getDone, markDone } from "../storage";
import type { ConceptStory, GlossaryTerm, Paper } from "../types";
import { SpeakScreen } from "./Speak";

interface Props {
  unit: LessonUnit;
  index: number;
  paper: Paper;
  go: (s: Screen) => void;
}

export function UnitScreen({ unit, index, paper, go }: Props) {
  const { language, pick, t, en } = useLang();
  const [story, setStory] = useState<ConceptStory | null>(null);
  const [glossary, setGlossary] = useState<Record<string, GlossaryTerm> | null>(null);
  const [l1, setL1] = useState<Record<string, L1>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"talk" | "quiz">("talk");
  const [done, setDone] = useState(() => new Set(getDone()));

  useEffect(() => {
    setFailed(false);
    Promise.all([getConcept(unit.concept, language.code), getGlossary()])
      .then(([s, g]) => {
        setStory(s);
        setGlossary(Object.fromEntries(g.map((x) => [x.id, x])));
      })
      .catch(() => setFailed(true));
    getExplain(unit.words, language.code)
      .then((d) => setL1(Object.fromEntries(d.terms.map((x) => [x.id, x.l1]))))
      .catch(() => {
        /* English still works */
      });
    return () => stopSpeaking();
  }, [unit, language.code, attempt]);

  function finish(part: Part) {
    markDone(partId(unit.id, part));
    setDone(new Set(getDone()));
  }

  if (failed || !story || !glossary) {
    return (
      <>
        <TopBar go={go} />
        <main className="page" aria-busy={!failed}>
          {failed ? <LoadFailed onRetry={() => setAttempt((n) => n + 1)} /> : <Loading />}
        </main>
      </>
    );
  }

  const isDone = (p: Part) => done.has(partId(unit.id, p));

  return (
    <>
      <TopBar go={go} voiceToggle />
      <main className={`unit-page unit-${unit.color}`}>
        <header className="unit-hero">
          <span className="unit-hero-num">{index + 1}</span>
          <div className="unit-hero-text">
            <p className="unit-hero-kicker">{en("lesson_n", { n: index + 1 })}</p>
            <h1>
              <BiText native={pick(story.title)} english={story.title.en} />
            </h1>
          </div>
        </header>

        <div className="unit-cols">
          <section className="panel">
            <h2 className="panel-title">
              <Icon name="book" size={24} />
              <Bi k="learn" />
              {isDone("learn") && <Icon name="check" size={22} />}
            </h2>
            <StoryStepper story={story} onEnd={() => finish("learn")} />

            <h3 className="panel-sub">
              <Bi k="key_words" />
            </h3>
            <ul className="kw-list">
              {unit.words.map((id) =>
                glossary[id] ? <KeyWord key={id} g={glossary[id]} l1={l1[id]} /> : null,
              )}
            </ul>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => go({ name: "explore", paper: unit.paper, nodeId: `${unit.id}:explore`, back: { name: "unit", id: unit.id } })}
            >
              <Icon name="look" />
              <BiText native={`${t("see_real")}: ${pick(paper.title)}`} english={`${en("see_real")}: ${paper.title.en}`} />
            </button>
          </section>

          <section className="panel panel-practice">
            <h2 className="panel-title">
              <Icon name="mic" size={24} />
              <Bi k="practice" />
            </h2>
            <div className="tabs" role="tablist">
              {(["talk", "quiz"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  className={tab === k ? "is-on" : ""}
                  onClick={() => {
                    stopSpeaking();
                    setTab(k);
                  }}
                >
                  <Icon name={k === "talk" ? "chat" : "check"} size={22} />
                  <Bi k={k === "talk" ? "talk_tab" : "quiz_tab"} />
                  {isDone(k) && <span className="tab-done" aria-hidden="true" />}
                </button>
              ))}
            </div>
            {tab === "talk" ? (
              <SpeakScreen key={unit.scenario} id={unit.scenario} go={go} embedded onDone={() => finish("talk")} />
            ) : (
              <MiniQuiz words={unit.words} checks={story.checks} onDone={() => finish("quiz")} />
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function StoryStepper({ story, onEnd }: { story: ConceptStory; onEnd: () => void }) {
  const [at, setAt] = useState(0);
  const card = story.cards[at];
  const last = at === story.cards.length - 1;

  useEffect(() => {
    if (last) onEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  return (
    <div className="stepper">
      <div className="stepper-card" key={at}>
        <span className="stepper-icon" aria-hidden="true">
          <Icon name={card.icon} size={34} />
        </span>
        <SayLine text={card.say} className="sayline-big" />
        {card.explain_l1 ? <L1Reveal text={card.explain_l1} /> : <p className="helper-line">{card.explain}</p>}
      </div>
      <div className="stepper-nav">
        <button
          type="button"
          className="icon-btn"
          disabled={at === 0}
          onClick={() => {
            stopSpeaking();
            setAt(at - 1);
          }}
          aria-label="Back"
        >
          <Icon name="back" size={24} />
        </button>
        <ol className="story-dots" aria-hidden="true">
          {story.cards.map((_, i) => (
            <li key={i} className={i === at ? "is-now" : i < at ? "is-done" : ""} />
          ))}
        </ol>
        <button
          type="button"
          className="icon-btn icon-btn-go"
          disabled={last}
          onClick={() => {
            stopSpeaking();
            setAt(at + 1);
            void sayEnglish(story.cards[at + 1].say, true);
          }}
          aria-label="Next"
        >
          <Icon name="forward" size={24} />
        </button>
      </div>
    </div>
  );
}

function KeyWord({ g, l1 }: { g: GlossaryTerm; l1: L1 | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`kw${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="kw-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void sayEnglish(g.term, true);
        }}
      >
        <span className="kw-word" lang="en">
          {g.term}
        </span>
        <Icon name="forward" size={20} />
      </button>
      {open && (
        <div className="kw-body">
          <Syllables say={g.say} />
          <SayLine text={g.definition} />
          <L1Reveal text={l1?.meaning} />
        </div>
      )}
    </li>
  );
}
