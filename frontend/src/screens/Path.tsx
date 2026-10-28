// The one learning page: a path of big round buttons, grouped by paper, then
// talking practice, then quizzes. Every button can be tapped. The next one
// to try bounces, so a first-time learner always knows where to start.

import { useMemo, type CSSProperties } from "react";
import type { Screen } from "../App";
import { Clip } from "../components/Clip";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { BiText, useLang } from "../i18n";
import { buildPath, type PathNode } from "../path";
import { unlockAudio } from "../speech";
import { getDone } from "../storage";
import type { ConceptSummary, Paper } from "../types";

// Sideways steps for the winding path, in node widths.
const WIGGLE = [0, 0.9, 1.3, 0.9, 0, -0.9, -1.3, -0.9];

export function PathScreen({ papers, concepts, go }: { papers: Paper[]; concepts: ConceptSummary[]; go: (s: Screen) => void }) {
  const { config, pick, t, en } = useLang();
  const units = useMemo(() => buildPath(papers, concepts, config.scenarios), [papers, concepts, config.scenarios]);
  const done = useMemo(() => new Set(getDone()), []);
  const nextId = units.flatMap((u) => u.nodes).find((n) => !done.has(n.id))?.id;

  function open(n: PathNode) {
    unlockAudio();
    if (n.kind === "explore") go({ name: "explore", paper: n.paper.id, nodeId: n.id });
    else if (n.kind === "story") go({ name: "story", id: n.concept.id, paper: n.concept.paper, nodeId: n.id });
    else if (n.kind === "lesson") go({ name: "lesson", paper: n.paper.id, words: n.words, nodeId: n.id });
    else if (n.kind === "talk") go({ name: "speak", id: n.scenario.id, nodeId: n.id });
    else go({ name: "quiz", termIds: n.words, nodeId: n.id, big: !n.paper });
  }

  function label(n: PathNode) {
    if (n.kind === "explore") return <BiText native={t(n.paper.kind === "card" ? "explore_card" : "explore_form")} english={en(n.paper.kind === "card" ? "explore_card" : "explore_form")} />;
    if (n.kind === "story") return <BiText native={pick(n.concept.title)} english={n.concept.title.en} />;
    if (n.kind === "lesson")
      return (
        <span className="node-words" lang="en" dir="ltr">
          {n.labels.join(" · ")}
        </span>
      );
    if (n.kind === "talk") return <BiText native={pick(n.scenario.title)} english={n.scenario.title.en} />;
    return n.paper ? <BiText native={pick(n.paper.title)} english={n.paper.title.en} /> : <BiText native={t("big_quiz")} english={en("big_quiz")} />;
  }

  function icon(n: PathNode) {
    if (done.has(n.id)) return "check";
    if (n.kind === "explore") return "look";
    if (n.kind === "story") return "book";
    if (n.kind === "lesson") return "star";
    if (n.kind === "talk") return "mic";
    return "check";
  }

  let lessonNo = 0;

  return (
    <>
      <TopBar go={go} showHome={false} />
      <main className="path-page">
        <Clip k="clip_hello" size={80} />
        {units.map((u) => (
          <section key={u.id} className={`unit unit-${u.color}`}>
            <header className="unit-banner">
              <span className="unit-icon" aria-hidden="true">
                <Icon name={u.paper?.icon ?? (u.id === "talk" ? "chat" : "star")} size={30} />
              </span>
              <span className="unit-text">
                {u.paper ? (
                  <BiText native={pick(u.paper.title)} english={u.paper.title.en} />
                ) : (
                  <BiText native={t(u.titleKey!)} english={en(u.titleKey!)} />
                )}
                {u.paper && <span className="unit-about">{pick(u.paper.about)}</span>}
              </span>
            </header>
            <ol className="path">
              {u.nodes.map((n, i) => {
                const isDone = done.has(n.id);
                const isNext = n.id === nextId;
                if (n.kind === "lesson") lessonNo += 1;
                return (
                  <li key={n.id} className="path-step" style={{ "--x": WIGGLE[i % WIGGLE.length] } as CSSProperties}>
                    {isNext && (
                      <span className="node-start" aria-hidden="true">
                        {t("start")}
                      </span>
                    )}
                    <button
                      type="button"
                      className={`node node-${n.kind}${isDone ? " is-done" : ""}${isNext ? " is-next" : ""}`}
                      onClick={() => open(n)}
                    >
                      {n.kind === "lesson" && !isDone ? (
                        <span className="node-num">{lessonNo}</span>
                      ) : (
                        <Icon name={icon(n)} size={36} />
                      )}
                    </button>
                    <span className="node-label">{label(n)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </main>
    </>
  );
}
