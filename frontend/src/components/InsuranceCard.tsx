import type { ReactNode } from "react";
import { Bi, useLang } from "../i18n";

interface Props {
  compact?: boolean;
  /** When set, words on the card can be tapped to learn them */
  onTap?: (termId: string) => void;
  selected?: string | null;
  seen?: string[];
}

/** The pretend insurance card learners read from and tap to learn (realia, never real data). */
export function InsuranceCard({ compact = false, onTap, selected = null, seen = [] }: Props) {
  const { config, t } = useLang();
  const p = config.pretend_patient;

  const word = (id: string | null, label: string): ReactNode =>
    onTap && id ? (
      <button
        type="button"
        className={`ins-term${selected === id ? " is-selected" : ""}${seen.includes(id) ? " is-seen" : ""}`}
        aria-pressed={selected === id}
        onClick={() => onTap(id)}
      >
        {label}
      </button>
    ) : (
      label
    );

  const copayWords: Record<string, string> = {
    Specialist: "specialist",
    "Urgent care": "urgent_care",
    "Emergency room": "emergency_room",
    "Generic drugs": "generic_drug",
  };

  return (
    <figure className={`ins${compact ? " ins-compact" : ""}${onTap ? " ins-tappable" : ""}`}>
      {!onTap && (
        <figcaption className="ins-caption">
          <Bi k="your_card" />
        </figcaption>
      )}
      <div className="ins-card" lang="en" dir="ltr">
        <div className="ins-top">
          <span className="ins-plan">{p.plan}</span>
          <span className="ins-type">{p.plan_type}</span>
        </div>
        <dl className="ins-ids">
          <div>
            <dt>{word("policyholder", "Policyholder")}</dt>
            <dd>{p.name}</dd>
          </div>
          <div>
            <dt>{word("member_id", "Member ID")}</dt>
            <dd className="ins-num">{p.member_id}</dd>
          </div>
          <div>
            <dt>{word("group_number", "Group #")}</dt>
            <dd className="ins-num">{p.group_number}</dd>
          </div>
          <div>
            <dt>{word("date_of_birth", "Date of birth")}</dt>
            <dd className="ins-num">{p.date_of_birth}</dd>
          </div>
          {!compact && (
            <div>
              <dt>{word("primary_care_provider", "PCP")}</dt>
              <dd>{p.primary_care_provider}</dd>
            </div>
          )}
        </dl>
        {!compact && (
          <dl className="ins-copays">
            <div className="ins-copays-head">
              <dt>{word("copay", "Copays")}</dt>
            </div>
            {Object.entries(p.copays).map(([k, v]) => (
              <div key={k}>
                <dt>{word(copayWords[k] ?? null, k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>{word("deductible", "Deductible")}</dt>
              <dd>{p.deductible}</dd>
            </div>
          </dl>
        )}
        <p className="ins-phone">
          {word("member_services", "Member services")}: {p.member_services_phone}
        </p>
      </div>
      <p className="ins-note">{t("pretend_note")}</p>
    </figure>
  );
}
