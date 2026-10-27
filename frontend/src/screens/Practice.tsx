import type { Screen } from "../App";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";

/** The six practice situations, in patient-journey order from easier to harder. */
export function Practice({ go, suggested = [] }: { go: (s: Screen) => void; suggested?: string[] }) {
  const { config, pick, t } = useLang();
  const want = new Set(suggested);
  const overlap = config.scenarios.map((s) => s.target_terms.filter((id) => want.has(id)).length);
  const best = want.size ? overlap.indexOf(Math.max(...overlap)) : -1;

  return (
    <>
      <TopBar go={go} />
      <main className="page practice">
        <h1 className="screen-title">
          <Bi k="choose_situation" />
        </h1>
        <p className="hint-plain">{t("practice_intro")}</p>
        <ol className="journey">
          {config.scenarios.map((s, i) => (
            <li key={s.id} className={i === best && overlap[i] > 0 ? "is-suggested" : ""}>
              <button type="button" className="journey-step" onClick={() => go({ name: "scenario", id: s.id })}>
                <span className="journey-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="journey-text">
                  <span className="journey-icon">
                    <Icon name={s.icon} size={26} />
                  </span>
                  <span className="bi">
                    <span className="bi-native">{pick(s.title)}</span>
                    {pick(s.title) !== s.title.en && (
                      <span className="bi-en" lang="en">
                        {s.title.en}
                      </span>
                    )}
                  </span>
                  <span className="journey-goal">{pick(s.goal)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
