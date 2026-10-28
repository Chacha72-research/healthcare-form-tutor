// Look at a paper: the form (or the insurance card) with its words marked.
// Tricky words are bright yellow. Tap any word, in any order, to open its card.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Screen } from "../App";
import { getExplain, getGlossary } from "../api";
import { Clip } from "../components/Clip";
import { Icon } from "../components/Icon";
import { InsuranceCard } from "../components/InsuranceCard";
import { LoadFailed, Loading } from "../components/Loading";
import { TopBar } from "../components/TopBar";
import { WordCard, type L1 } from "../components/WordCard";
import { Bi, BiText, useLang } from "../i18n";
import { paperTerms } from "../path";
import { prefetch, stopSpeaking } from "../speech";
import { markDone } from "../storage";
import type { FormReading, GlossaryTerm, Paper } from "../types";

export function ExploreScreen({
  paper,
  nodeId,
  back = { name: "home" },
  go,
}: {
  paper: Paper;
  nodeId: string;
  back?: Screen;
  go: (s: Screen) => void;
}) {
  const { language, pick } = useLang();
  const [glossary, setGlossary] = useState<Record<string, GlossaryTerm> | null>(null);
  const [l1, setL1] = useState<Record<string, L1>>({});
  const [translating, setTranslating] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);
  const isCard = paper.kind === "card";

  const terms = useMemo(() => paperTerms(paper), [paper]);
  const yellow = useMemo(() => terms.filter((x) => isCard || x.confusing).map((x) => x.id), [terms, isCard]);
  const all = useMemo(() => terms.map((x) => x.id), [terms]);

  useEffect(() => {
    setFailed(false);
    getGlossary()
      .then((list) => setGlossary(Object.fromEntries(list.map((x) => [x.id, x]))))
      .catch(() => setFailed(true));
  }, [attempt]);

  // The learner's language: yellow words first, then the rest. Saved after the first time.
  useEffect(() => {
    let alive = true;
    setTranslating(true);
    const rest = all.filter((id) => !yellow.includes(id));
    void (async () => {
      for (const ids of [yellow, rest]) {
        if (!ids.length) continue;
        try {
          const data = await getExplain(ids, language.code);
          if (!alive) return;
          setL1((prev) => ({ ...prev, ...Object.fromEntries(data.terms.map((x) => [x.id, x.l1])) }));
        } catch {
          /* English still works */
        }
      }
      if (alive) setTranslating(false);
    })();
    return () => {
      alive = false;
    };
  }, [all, yellow, language.code]);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    sheet.current?.querySelector(".is-selected")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  function select(id: string) {
    stopSpeaking();
    setSelected(id);
    setSeen((s) => (s.includes(id) ? s : [...s, id]));
    markDone(nodeId);
    const meaning = l1[id]?.meaning;
    if (meaning) prefetch([{ text: meaning, lang: "l1", voice: "tutor", style: "tutor" }]);
  }

  function nextId(): string {
    const order = yellow.length ? yellow : all;
    const at = selected ? order.indexOf(selected) : -1;
    for (let k = 1; k <= order.length; k++) {
      const id = order[(at + k + order.length) % order.length];
      if (!seen.includes(id)) return id;
    }
    return order[(at + 1) % order.length];
  }

  if (failed) {
    return (
      <>
        <TopBar go={go} />
        <main className="page">
          <LoadFailed onRetry={() => setAttempt((n) => n + 1)} />
        </main>
      </>
    );
  }

  const term = selected && glossary ? glossary[selected] : null;

  return (
    <>
      <TopBar go={go} />
      <div className={`formview${selected ? " has-card" : ""}`}>
        <main className="formview-main">
          <header className="paper-head">
            <span className="paper-icon" aria-hidden="true">
              <Icon name={paper.icon} size={30} />
            </span>
            <h1 className="paper-title">
              <BiText native={pick(paper.title)} english={paper.title.en} />
            </h1>
          </header>
          <p className="paper-about">
            <BiText native={pick(paper.about)} english={paper.about.en} />
          </p>
          <Clip k={isCard ? "clip_tap_card" : "clip_tap_word"} />

          {isCard ? (
            <div ref={sheet}>
              <InsuranceCard onTap={select} selected={selected} seen={seen} />
            </div>
          ) : (
            <div className="formsheet formsheet-full" ref={sheet} lang="en" dir="ltr">
              {paper.reading!.lines.map((ln, i) => (
                <p key={i}>
                  <PaperLine line={ln} order={i} yellow={yellow} seen={seen} selected={selected} onTap={select} />
                </p>
              ))}
            </div>
          )}

          <div className="actions">
            <button type="button" className="btn btn-primary btn-big" onClick={() => go(back)}>
              <Icon name="back" />
              <Bi k={back.name === "unit" ? "back_to_lesson" : "continue"} />
            </button>
          </div>
        </main>

        <aside className={`termpanel${selected ? " is-open" : ""}`} aria-live="polite">
          {term ? (
            <WordCard
              key={term.id}
              g={term}
              l1={l1[term.id]}
              translating={translating}
              onClose={() => {
                stopSpeaking();
                setSelected(null);
              }}
              onNext={() => select(nextId())}
            />
          ) : selected ? (
            <Loading />
          ) : (
            <div className="termcard termcard-empty">
              <span className="termcard-empty-icon" aria-hidden="true">
                <Icon name="look" size={44} />
              </span>
              <p>
                <Bi k={isCard ? "clip_tap_card" : "clip_tap_word"} />
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

export function PaperLine({
  line,
  order = 0,
  yellow,
  seen = [],
  selected = null,
  onTap,
  target,
}: {
  line: FormReading["lines"][number];
  order?: number;
  yellow: string[];
  seen?: string[];
  selected?: string | null;
  onTap: (id: string) => void;
  /** In a lesson: picked marks turn green or red */
  target?: { id: string; picked: string | null };
}) {
  const out: ReactNode[] = [];
  let last = 0;
  line.marks.forEach((m, j) => {
    if (m.start > last) out.push(line.text.slice(last, m.start));
    const result = target?.picked
      ? m.term_id === target.id
        ? "is-right"
        : m.term_id === target.picked
          ? "is-wrong"
          : ""
      : "";
    const cls = [
      "mk",
      yellow.includes(m.term_id) ? "mk-tricky" : "mk-plain",
      seen.includes(m.term_id) ? "is-seen" : "",
      selected === m.term_id ? "is-selected" : "",
      result,
    ]
      .filter(Boolean)
      .join(" ");
    out.push(
      <button
        key={j}
        type="button"
        className={cls}
        style={{ "--i": order } as CSSProperties}
        aria-pressed={selected === m.term_id}
        disabled={Boolean(target?.picked)}
        onClick={() => onTap(m.term_id)}
      >
        {line.text.slice(m.start, m.end)}
      </button>,
    );
    last = m.end;
  });
  out.push(line.text.slice(last));
  return <>{out}</>;
}
