import type { CSSProperties } from "react";
import type { Screen } from "../App";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import { ENGLISH } from "../speech";
import type { ExplainResponse } from "../types";

export function Results({ data, go }: { data: ExplainResponse; go: (s: Screen) => void }) {
  const { language, voice, t } = useLang();
  const allAi = data.terms.length > 0 && data.terms.every((term) => term.explanation_source === "ai");

  return (
    <>
      <TopBar go={go} />
      <main className="page results">
        {data.form_summary && (
          <div className="summary">
            <p>{data.form_summary}</p>
            <ListenButton text={data.form_summary} voice={voice} label={t("listen")} />
          </div>
        )}

        <h1 className="screen-title">
          <Bi k="words_on_form" />
        </h1>

        {data.terms.length === 0 && <p className="notice">{t("no_terms")}</p>}

        {/* Until a teacher approves translations, every explanation is a computer translation.
            Say so once instead of on every word. */}
        {allAi && <p className="field-source">{t("ai_translation_note")}</p>}

        <ol className="fields">
          {data.terms.map((term, i) => (
            <li key={term.id} className="field" style={{ "--i": i } as CSSProperties}>
              {term.form_text && (
                <p className="field-label">
                  {t("form_says")} <span lang="en">{term.form_text}</span>
                </p>
              )}

              <div className="field-term" dir="ltr">
                <span className="hl" lang="en">
                  {term.term}
                </span>
                <ListenButton
                  text={term.term}
                  voice={ENGLISH}
                  slow
                  tag="English"
                  label={`${term.term}: ${t("listen")}`}
                />
              </div>

              <div className="field-explain" lang={language.code}>
                <p>{term.explanation}</p>
                <ListenButton text={term.explanation} voice={voice} label={t("listen")} size="lg" />
              </div>

              {!allAi && term.explanation_source === "ai" && (
                <p className="field-source">{t("ai_translation_note")}</p>
              )}
            </li>
          ))}
        </ol>

        {data.unlisted_terms.length > 0 && (
          <section className="ask-teacher">
            <h2>{t("ask_teacher")}</h2>
            <ul>
              {data.unlisted_terms.map((w) => (
                <li key={w} lang="en">
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="actions">
          {data.terms.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-big"
              onClick={() => go({ name: "quiz", termIds: data.terms.map((term) => term.id) })}
            >
              <Icon name="check" />
              <Bi k="quiz_me" />
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => go({ name: "scan" })}>
            <Icon name="camera" />
            <Bi k="retake" />
          </button>
        </div>
      </main>
    </>
  );
}
