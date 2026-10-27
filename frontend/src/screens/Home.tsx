import type { Screen } from "../App";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { Bi } from "../i18n";

export function Home({ go }: { go: (s: Screen) => void }) {
  return (
    <>
      <TopBar go={go} showHome={false} />
      <main className="page home">
        <button type="button" className="tile tile-primary" onClick={() => go({ name: "upload" })}>
          <span className="tile-icon">
            <Icon name="upload" size={44} />
          </span>
          <Bi k="home_upload" />
        </button>

        <button type="button" className="tile tile-strong" onClick={() => go({ name: "practice" })}>
          <span className="tile-icon">
            <Icon name="chat" size={38} />
          </span>
          <Bi k="home_practice" />
        </button>

        <button type="button" className="tile" onClick={() => go({ name: "quiz", termIds: [] })}>
          <span className="tile-icon">
            <Icon name="check" size={34} />
          </span>
          <Bi k="home_quiz" />
        </button>
      </main>
    </>
  );
}
