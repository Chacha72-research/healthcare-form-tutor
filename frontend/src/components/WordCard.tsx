// The card that opens when you tap a word on a paper. English comes first
// (big, and tap any sentence to hear it), with the learner's language
// underneath as the helper.

import { useLang } from "../i18n";
import type { ExplainedTerm, GlossaryTerm } from "../types";
import { Bi } from "../i18n";
import { Icon } from "./Icon";
import { ListenButton } from "./ListenButton";
import { Marked } from "./Marked";
import { SayLine, WordHero } from "./WordHero";

export type L1 = ExplainedTerm["l1"];

interface Props {
  g: GlossaryTerm;
  l1: L1 | undefined;
  translating: boolean;
  onClose: () => void;
  onNext: () => void;
}

export function WordCard({ g, l1, translating, onClose, onNext }: Props) {
  const { language, t } = useLang();
  const shimmer = <p className="shimmer">{t("translating")}</p>;
  const helper = (text: string | null | undefined, big = false) =>
    text ? (
      <div className="helper">
        <p className={big ? "helper-big" : ""} lang={language.code}>
          {text}
        </p>
        <ListenButton
          parts={[{ text, lang: "l1", voice: "tutor", style: "tutor" }]}
          label={t("listen")}
          size="sm"
          tag={big ? language.native_name : undefined}
        />
      </div>
    ) : translating ? (
      shimmer
    ) : null;

  return (
    <article className="termcard" aria-label={g.term}>
      <div className="termcard-top">
        {g.confusing ? <span className="badge-tricky">{t("tricky")}</span> : <span />}
        <button type="button" className="termcard-close" onClick={onClose} aria-label={t("close")}>
          <Icon name="close" size={24} />
        </button>
      </div>

      <WordHero term={g.term} say={g.say} autoSay />

      <section className="termcard-block">
        <h3 className="termcard-label">
          <Bi k="what_it_means" />
        </h3>
        <SayLine text={g.definition} className="sayline-big" />
        {helper(l1?.meaning, true)}
      </section>

      <section className="termcard-block termcard-write">
        <h3 className="termcard-label">
          <Icon name="pencil" size={20} />
          <Bi k="what_to_write" />
        </h3>
        <SayLine text={g.tip} />
        {helper(l1?.tip)}
      </section>

      <section className="termcard-block">
        <h3 className="termcard-label">
          <Bi k="example_label" />
        </h3>
        <SayLine text={g.example} className="sayline-example">
          <Marked text={g.example} words={[g.term]} />
        </SayLine>
        {l1?.example_meaning && <p className="example-l1">{l1.example_meaning}</p>}
      </section>

      {l1?.meaning && !l1.approved && <p className="source-note">{t("ai_translation_note")}</p>}

      <button type="button" className="btn btn-primary termcard-next" onClick={onNext}>
        <Bi k="next_word" />
        <Icon name="forward" size={24} />
      </button>
    </article>
  );
}
