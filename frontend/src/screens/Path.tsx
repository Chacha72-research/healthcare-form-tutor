// The home page: the big picture, then 5 lessons, then a final quiz.
// Every button can be tapped; the next one to try bounces.

import { useMemo, type CSSProperties } from "react";
import type { Screen } from "../App";
import { Clip } from "../components/Clip";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { BiText, useLang } from "../i18n";
import { ALL_LESSON_WORDS, LESSONS, PARTS, partId } from "../path";
import { unlockAudio } from "../speech";
import { getDone } from "../storage";
import type { ConceptSummary } from "../types";

const WIGGLE = [0, 1, 0, -1, 0, 1];

export function PathScreen({ concepts, go }: { concepts: ConceptSummary[]; go: (s: Screen) => void }) {
  const { t, en, pick } = useLang();
  const done = useMemo(() => new Set(getDone()), []);
  const lessonDone = (id: string) => PARTS.every((p) => done.has(partId(id, p)));
  const steps = [
    ...LESSONS.map((l) => ({ id: l.id, finished: lessonDone(l.id) })),
    { id: "final", finished: done.has("quiz:final") },
  ];
  const nextId = done.has("big_picture") ? steps.find((s) => !s.finished)?.id : undefined;

  return (
    <>
      <TopBar go={go} showHome={false} />
      <main className="path-page">
        <Clip k="clip_hello" size={64} />

        <button
          type="button"
          className={`bigpic-card${done.has("big_picture") ? "" : " is-next"}`}
          onClick={() => go({ name: "bigpicture" })}
        >
          <span className="bigpic-card-flow" aria-hidden="true">
            <span className="bp-dot">
              <Icon name="home" size={22} />
            </span>
            <span className="bp-line" />
            <span className="bp-dot">
              <Icon name="desk" size={22} />
            </span>
            <span className="bp-line" />
            <span className="bp-dot">
              <Icon name="card" size={22} />
            </span>
          </span>
          <span className="bigpic-card-text">
            <BiText native={t("big_picture")} english={en("big_picture")} />
          </span>
          {done.has("big_picture") ? <Icon name="check" size={28} /> : <Icon name="forward" size={28} />}
        </button>

        <ol className="path path-short">
          {LESSONS.map((l, i) => {
            const c = concepts.find((x) => x.id === l.concept);
            const finished = lessonDone(l.id);
            const isNext = l.id === nextId;
            return (
              <li key={l.id} className={`path-step unit-${l.color}`} style={{ "--x": WIGGLE[i] } as CSSProperties}>
                {isNext && (
                  <span className="node-start" aria-hidden="true">
                    {en("start")}
                  </span>
                )}
                <button
                  type="button"
                  className={`node${finished ? " is-done" : ""}${isNext ? " is-next" : ""}`}
                  onClick={() => {
                    unlockAudio();
                    go({ name: "unit", id: l.id });
                  }}
                >
                  {finished ? <Icon name="check" size={36} /> : <span className="node-num">{i + 1}</span>}
                </button>
                <span className="node-label">
                  {c && <BiText native={pick(c.title)} english={c.title.en} />}
                </span>
                <span className="node-parts" aria-hidden="true">
                  {PARTS.map((p) => (
                    <span key={p} className={done.has(partId(l.id, p)) ? "is-done" : ""} />
                  ))}
                </span>
              </li>
            );
          })}
          <li className="path-step unit-violet" style={{ "--x": 0 } as CSSProperties}>
            {nextId === "final" && (
              <span className="node-start" aria-hidden="true">
                {en("start")}
              </span>
            )}
            <button
              type="button"
              className={`node node-final${done.has("quiz:final") ? " is-done" : ""}${nextId === "final" ? " is-next" : ""}`}
              onClick={() => go({ name: "quiz", termIds: ALL_LESSON_WORDS, nodeId: "quiz:final", big: true })}
            >
              <Icon name="star" size={38} />
            </button>
            <span className="node-label">
              <BiText native={t("final_quiz")} english={en("final_quiz")} />
            </span>
          </li>
        </ol>
      </main>
    </>
  );
}
