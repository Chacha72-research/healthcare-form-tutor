import { useEffect, useMemo, useState } from "react";
import { getConfig } from "./api";
import { LangProvider, makeLangValue } from "./i18n";
import { stopSpeaking, setServerTts } from "./speech";
import type { AppConfig, ExplainResponse, TeacherParams } from "./types";
import { LanguagePicker } from "./screens/LanguagePicker";
import { Home } from "./screens/Home";
import { Scan } from "./screens/Scan";
import { Results } from "./screens/Results";
import { QuizScreen } from "./screens/Quiz";
import { Talk } from "./screens/Talk";

export type Screen =
  | { name: "language" }
  | { name: "home" }
  | { name: "scan" }
  | { name: "results"; data: ExplainResponse }
  | { name: "quiz"; termIds: string[] }
  | { name: "talk" };

const LANG_KEY = "form-helper-language";

function readTeacherParams(): TeacherParams {
  const p = new URLSearchParams(location.search);
  const phase = p.get("phase");
  return {
    phase: phase === "pre" || phase === "post" ? phase : "practice",
    learner: (p.get("learner") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20),
    terms: (p.get("terms") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    seed: p.get("seed"),
  };
}

function savedLanguage(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [langCode, setLangCode] = useState<string | null>(savedLanguage);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const teacher = useMemo(readTeacherParams, []);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setConfig(c);
        setServerTts(c.features.server_tts);
      })
      .catch(() => setLoadError(true));
  }, []);

  // A teacher link with a quiz phase opens the quiz directly.
  useEffect(() => {
    if (teacher.phase !== "practice") setScreen({ name: "quiz", termIds: teacher.terms });
  }, [teacher]);

  const language = config?.languages.find((l) => l.code === langCode) ?? null;

  useEffect(() => {
    document.documentElement.lang = language?.code ?? "en";
    document.documentElement.dir = language?.dir ?? "ltr";
    if (language) document.title = language.ui.app_title ?? "Form Helper";
  }, [language]);

  function go(next: Screen) {
    stopSpeaking();
    setScreen(next);
    window.scrollTo(0, 0);
  }

  function chooseLanguage(code: string) {
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* private browsing: just keep it for this visit */
    }
    setLangCode(code);
    go(screen.name === "language" ? { name: "home" } : screen);
  }

  if (loadError) {
    return (
      <main className="page">
        <p className="notice notice-bad">Cannot reach the server. Check that the Python backend is running.</p>
      </main>
    );
  }
  if (!config) return <main className="page" aria-busy="true" />;

  if (!language || screen.name === "language") {
    return <LanguagePicker config={config} current={langCode} onChoose={chooseLanguage} />;
  }

  return (
    <LangProvider value={makeLangValue(config, language)}>
      {screen.name === "home" && <Home go={go} />}
      {screen.name === "scan" && <Scan go={go} />}
      {screen.name === "results" && <Results data={screen.data} go={go} />}
      {screen.name === "quiz" && <QuizScreen termIds={screen.termIds} teacher={teacher} go={go} />}
      {screen.name === "talk" && <Talk go={go} />}
    </LangProvider>
  );
}
