import { Bi, useLang } from "../i18n";

/** The pretend insurance card learners read from during practice (realia, never real data). */
export function InsuranceCard({ compact = false }: { compact?: boolean }) {
  const { config, t } = useLang();
  const p = config.pretend_patient;
  return (
    <figure className={`ins${compact ? " ins-compact" : ""}`}>
      <figcaption className="ins-caption">
        <Bi k="your_card" />
      </figcaption>
      <div className="ins-card" lang="en" dir="ltr">
        <div className="ins-top">
          <span className="ins-plan">{p.plan}</span>
          <span className="ins-type">{p.plan_type}</span>
        </div>
        <dl className="ins-ids">
          <div>
            <dt>Member</dt>
            <dd>{p.name}</dd>
          </div>
          <div>
            <dt>Member ID</dt>
            <dd className="ins-num">{p.member_id}</dd>
          </div>
          <div>
            <dt>Group #</dt>
            <dd className="ins-num">{p.group_number}</dd>
          </div>
          <div>
            <dt>Date of birth</dt>
            <dd className="ins-num">{p.date_of_birth}</dd>
          </div>
          {!compact && (
            <div>
              <dt>PCP</dt>
              <dd>{p.primary_care_provider}</dd>
            </div>
          )}
        </dl>
        {!compact && (
          <dl className="ins-copays">
            {Object.entries(p.copays).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>Deductible</dt>
              <dd>{p.deductible}</dd>
            </div>
          </dl>
        )}
        <p className="ins-phone">Member services: {p.member_services_phone}</p>
      </div>
      <p className="ins-note">{t("pretend_note")}</p>
    </figure>
  );
}
