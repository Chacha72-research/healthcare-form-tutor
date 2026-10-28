// The card that opens when you tap a word on a paper. English comes first
// (big, and tap any sentence to hear it), with the learner's language
// underneath as the helper.

import { useLang } from "../i18n";
import type { ExplainedTerm, GlossaryTerm } from "../types";
import { Bi } from "../i18n";
import { Icon } from "./Icon";
import { L1Reveal } from "./L1Reveal";
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
  const { t } = useLang();
  const shimmer = <p className="shimmer">{t("translating")}</p>;
  const helper = (text: string | null | undefined) =>
    text ? <L1Reveal text={text} /> : translating ? shimmer : null;

  return (
    <article className="termcard" aria-label={g.term}>
      <div className="termcard-top">
        <span />
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
        {helper(l1?.meaning)}
      </section>

      <section className="termcard-block termcard-write">
        <h3 className="termcard-label">
          <Icon name="pencil" size={20} />
          <Bi k="what_to_write" />
        </h3>
        <SayLine text={g.tip} />
        {helper(l1?.tip)}
      </section>

      {l1?.meaning && !l1.approved && <p className="source-note">{t("ai_translation_note")}</p>}

      <button type="button" className="btn btn-primary termcard-next" onClick={onNext}>
        <Bi k="next_word" />
        <Icon name="forward" size={24} />
      </button>
    </article>
  );
}
