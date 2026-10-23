import type { Screen } from "../App";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";

export function Home({ go }: { go: (s: Screen) => void }) {
  const { config } = useLang();

  return (
    <>
      <TopBar go={go} showHome={false} />
      <main className="page home">
        <button type="button" className="tile tile-primary" onClick={() => go({ name: "scan" })}>
          <span className="tile-icon">
            <Icon name="camera" size={44} />
          </span>
          <Bi k="scan_form" />
        </button>

        <button type="button" className="tile" onClick={() => go({ name: "quiz", termIds: [] })}>
          <span className="tile-icon">
            <Icon name="check" size={36} />
          </span>
          <Bi k="quiz" />
        </button>

        <button
          type="button"
          className="tile"
          onClick={() => go({ name: "talk" })}
          aria-disabled={!config.features.conversation}
        >
          <span className="tile-icon">
            <Icon name="mic" size={36} />
          </span>
          <Bi k="practice_talking" />
        </button>
      </main>
    </>
  );
}
