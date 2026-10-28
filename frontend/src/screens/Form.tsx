// Understand a form. The learner's own form is shown with every health word
// marked. The tricky ones (words learners often mix up, like copay and
// deductible) are bright yellow. Tap any word, in any order, to see what it
// means in your language, what to write in that spot, an example, and one
// quick either/or question. Voice is only here, and only when you tap Listen.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Screen } from "../App";
import { getExplain, getGlossary } from "../api";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { LoadFailed, Loading } from "../components/Loading";
import { Marked } from "../components/Marked";
import { Stressed } from "../components/Stressed";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import { prefetch, stopSpeaking, type SpeechPart } from "../speech";
import type { ExplainedTerm, FormReading, GlossaryTerm } from "../types";

type L1 = ExplainedTerm["l1"];

const l1Part = (text: string): SpeechPart => ({ text, lang: "l1", voice: "tutor", style: "tutor" });

export function FormScreen({ reading, go }: { reading: FormReading; go: (s: Screen) => void }) {
  const { language, t } = useLang();
  const [glossary, setGlossary] = useState<Record<string, GlossaryTerm> | null>(null);
  const [l1, setL1] = useState<Record<string, L1>>({});
  const [translating, setTranslating] = useState(true);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);

  const all = useMemo(() => reading.terms.map((x) => x.id), [reading]);
  const tricky = useMemo(() => reading.terms.filter((x) => x.confusing).map((x) => x.id), [reading]);
  const labels = useMemo(() => Object.fromEntries(reading.terms.map((x) => [x.id, x.term])), [reading]);

  // Plain English comes from the glossary right away; no AI needed.
  useEffect(() => {
    setFailed(false);
    getGlossary()
      .then((list) => setGlossary(Object.fromEntries(list.map((x) => [x.id, x]))))
      .catch(() => setFailed(true));
  }, [attempt]);

  // The learner's language: tricky words first, then the rest.
  useEffect(() => {
    let alive = true;
    setAiNote(null);
    setTranslating(true);
    const rest = all.filter((id) => !tricky.includes(id));
    void (async () => {
      for (const ids of [tricky, rest]) {
        if (!ids.length) continue;
        try {
          const data = await getExplain(ids, language.code);
          if (!alive) return;
          setL1((prev) => ({ ...prev, ...Object.fromEntries(data.terms.map((x) => [x.id, x.l1])) }));
          if (data.ai_error) setAiNote(data.ai_error === "ai_busy" ? "ai_busy" : "error_generic");
          else if (!data.ai_available) setAiNote("ai_needs_key");
        } catch {
          if (alive) setAiNote("error_generic");
        }
      }
      if (alive) setTranslating(false);
    })();
    return () => {
      alive = false;
    };
  }, [all, tricky, language.code, attempt]);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    sheet.current?.querySelector(".is-selected")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  function select(id: string) {
    stopSpeaking();
    setSelected(id);
    setSeen((s) => (s.includes(id) ? s : [...s, id]));
    const meaning = l1[id]?.meaning;
    if (meaning) prefetch([l1Part(meaning)]);
  }

  const order = tricky.length ? tricky : all;
  function nextId(): string {
    const at = selected ? order.indexOf(selected) : -1;
    for (let k = 1; k <= order.length; k++) {
      const id = order[(at + k + order.length) % order.length];
      if (!seen.includes(id)) return id;
    }
    return order[(at + 1) % order.length];
  }

  const seenTricky = seen.filter((id) => tricky.includes(id)).length;
  const quizIds = seen.length >= 4 ? seen : tricky.length ? tricky : all;
  const term = selected && glossary ? glossary[selected] : null;

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

  return (
    <>
      <TopBar go={go} />
      <div className={`formview${selected ? " has-card" : ""}`}>
        <main className="formview-main">
          <header className="formview-head">
            <p className="found">
              <span className="found-num">{reading.terms.length}</span>
              <Bi k="found_words" vars={{ n: reading.terms.length }} />
            </p>
            {tricky.length > 0 && (
              <>
                <p className="found-tricky">
                  <span className="swatch" aria-hidden="true" />
                  <Bi k="found_tricky" vars={{ n: tricky.length }} />
                </p>
                <div className="opened">
                  <span className="opened-text">{t("tricky_opened", { n: seenTricky, total: tricky.length })}</span>
                  <span className="opened-bar" aria-hidden="true">
                    <span style={{ width: `${(100 * seenTricky) / tricky.length}%` }} />
                  </span>
                </div>
                <TrickyChips ids={tricky} labels={labels} seen={seen} selected={selected} onPick={select} className="tricky-chips-main" />
              </>
            )}
          </header>

          {aiNote && (
            <p className="notice notice-row">
              <span>{t(aiNote)}</span>
              {aiNote !== "ai_needs_key" && (
                <button type="button" className="btn-link" onClick={() => setAttempt((n) => n + 1)}>
                  {t("try_again")}
                </button>
              )}
            </p>
          )}

          <p className="hint-plain form-hint">
            <Icon name="form" size={22} />
            {t("tap_a_word")}
          </p>
          <div className="formsheet formsheet-full" ref={sheet} lang="en" dir="ltr">
            {reading.lines.map((ln, i) => (
              <p key={i}>
                <FormLine line={ln} order={i} tricky={tricky} seen={seen} selected={selected} onTap={select} />
              </p>
            ))}
          </div>

          {reading.unlisted.length > 0 && (
            <section className="ask-teacher">
              <h2>{t("ask_teacher")}</h2>
              <ul>
                {reading.unlisted.map((x) => (
                  <li key={x} lang="en">
                    {x}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary btn-big"
              onClick={() => go({ name: "quiz", termIds: quizIds, reading })}
            >
              <Icon name="check" />
              <Bi k="quiz_these" />
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => go({ name: "practice", suggested: order })}>
              <Icon name="mic" />
              <Bi k="home_practice" />
            </button>
          </div>
        </main>

        <aside className={`termpanel${selected ? " is-open" : ""}`} aria-live="polite">
          {term ? (
            <TermCard
              key={term.id}
              g={term}
              l1={l1[term.id]}
              translating={translating}
              answer={checks[term.id]}
              onAnswer={(a) => setChecks((c) => ({ ...c, [term.id]: a }))}
              onClose={() => {
                stopSpeaking();
                setSelected(null);
              }}
              onNext={() => select(nextId())}
              nextKey={tricky.length ? "next_tricky" : "next"}
            />
          ) : selected ? (
            <Loading />
          ) : (
            <div className="termcard termcard-empty">
              <span className="termcard-empty-icon" aria-hidden="true">
                <Icon name="form" size={48} />
              </span>
              <p>
                <Bi k="tap_a_word" />
              </p>
              {tricky.length > 0 && <TrickyChips ids={tricky} labels={labels} seen={seen} selected={selected} onPick={select} />}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function TrickyChips({
  ids,
  labels,
  seen,
  selected,
  onPick,
  className = "",
}: {
  ids: string[];
  labels: Record<string, string>;
  seen: string[];
  selected: string | null;
  onPick: (id: string) => void;
  className?: string;
}) {
  const { t } = useLang();
  return (
    <ul className={`tricky-chips ${className}`} aria-label={t("tricky")}>
      {ids.map((id) => (
        <li key={id}>
          <button
            type="button"
            lang="en"
            className={`${seen.includes(id) ? "is-seen" : ""}${selected === id ? " is-selected" : ""}`}
            onClick={() => onPick(id)}
          >
            {seen.includes(id) && <Icon name="check" size={16} />}
            {labels[id]}
          </button>
        </li>
      ))}
    </ul>
  );
}

interface CardProps {
  g: GlossaryTerm;
  l1: L1 | undefined;
  translating: boolean;
  answer: string | undefined;
  onAnswer: (a: string) => void;
  onClose: () => void;
  onNext: () => void;
  nextKey: string;
}

function TermCard({ g, l1, translating, answer, onAnswer, onClose, onNext, nextKey }: CardProps) {
  const { language, t } = useLang();
  const q = g.check.either_or;
  const waiting = !l1?.meaning && translating;
  const shimmer = <p className="shimmer">{t("translating")}</p>;

  return (
    <article className="termcard" aria-labelledby="termcard-title">
      <header className="termcard-head">
        <div className="termcard-word">
          {g.confusing && <span className="badge-tricky">{t("tricky")}</span>}
          <h2 id="termcard-title">
            <span className="hl hl-big" lang="en" dir="ltr">
              {g.term}
            </span>
          </h2>
          <div className="termcard-say">
            <Stressed say={g.say} />
            <ListenButton
              parts={[{ text: g.term, lang: "en", style: "model" }]}
              label={`${g.term}: ${t("listen")}`}
              tag="English"
            />
          </div>
        </div>
        <button type="button" className="termcard-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="close" size={24} />
        </button>
      </header>

      <Block label="what_it_means">
        {l1?.meaning ? (
          <div className="termcard-row">
            <p className="termcard-l1">
              <Marked text={l1.meaning} words={[g.term]} />
            </p>
            <ListenButton parts={[l1Part(l1.meaning)]} label={t("listen")} tag={language.native_name} />
          </div>
        ) : waiting ? (
          shimmer
        ) : null}
        <p className="termcard-en" lang="en" dir="ltr">
          {g.definition}
        </p>
      </Block>

      <Block label="what_to_write" icon="pencil" className="termcard-write">
        {l1?.tip ? (
          <div className="termcard-row">
            <p className="termcard-l1">{l1.tip}</p>
            <ListenButton parts={[l1Part(l1.tip)]} label={t("listen")} size="sm" />
          </div>
        ) : waiting ? (
          shimmer
        ) : null}
        <p className="termcard-en" lang="en" dir="ltr">
          {g.tip}
        </p>
      </Block>

      <Block label="example_label">
        <p className="example" lang="en" dir="ltr">
          <Marked text={g.example} words={[g.term]} />
        </p>
        {l1?.example_meaning && <p className="example-l1">{l1.example_meaning}</p>}
      </Block>

      <Block label="quick_check" className="termcard-check">
        <p className="question" lang="en" dir="ltr">
          {q.q}
        </p>
        <div className="replies replies-2">
          {q.options.map((opt) => {
            const state =
              answer === undefined ? "" : opt === q.answer ? " is-right" : opt === answer ? " is-wrong" : " is-faded";
            return (
              <button
                key={opt}
                type="button"
                lang="en"
                className={`reply${state}`}
                disabled={answer !== undefined}
                onClick={() => onAnswer(opt)}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {answer !== undefined && (
          <p className={`check-result ${answer === q.answer ? "is-right" : "is-wrong"}`} role="status">
            {answer === q.answer ? (
              <Bi k="correct" />
            ) : (
              <>
                <Bi k="not_quite" />{" "}
                <strong lang="en" dir="ltr">
                  {q.answer}
                </strong>
              </>
            )}
          </p>
        )}
      </Block>

      {l1?.meaning && !l1.approved && <p className="source-note">{t("ai_translation_note")}</p>}

      <button type="button" className="btn btn-primary termcard-next" onClick={onNext}>
        <Bi k={nextKey} />
        <Icon name="forward" size={24} />
      </button>
    </article>
  );
}

function Block({ label, icon, className = "", children }: { label: string; icon?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`termcard-block ${className}`}>
      <h3 className="termcard-label">
        {icon && <Icon name={icon} size={20} />}
        <Bi k={label} />
      </h3>
      {children}
    </section>
  );
}

function FormLine({
  line,
  order,
  tricky,
  seen,
  selected,
  onTap,
}: {
  line: FormReading["lines"][number];
  order: number;
  tricky: string[];
  seen: string[];
  selected: string | null;
  onTap: (id: string) => void;
}) {
  const out: ReactNode[] = [];
  let last = 0;
  line.marks.forEach((m, j) => {
    if (m.start > last) out.push(line.text.slice(last, m.start));
    const cls = [
      "mk",
      tricky.includes(m.term_id) ? "mk-tricky" : "mk-plain",
      seen.includes(m.term_id) ? "is-seen" : "",
      selected === m.term_id ? "is-selected" : "",
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
