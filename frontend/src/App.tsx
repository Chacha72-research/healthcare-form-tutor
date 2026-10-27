import { useEffect, useMemo, useState } from "react";
import { getConfig } from "./api";
import { LangProvider, makeLangValue } from "./i18n";
import { setLearnerBrowserLang, setServerVoice, stopSpeaking } from "./speech";
import type { AppConfig, FormReading, TeacherParams } from "./types";
import { LanguagePicker } from "./screens/LanguagePicker";
import { Home } from "./screens/Home";
import { Upload } from "./screens/Upload";
import { LessonScreen } from "./screens/Lesson";
import { QuizScreen } from "./screens/Quiz";
import { Practice } from "./screens/Practice";
import { ScenarioScreen } from "./screens/Scenario";

export const WORDS_PER_LESSON = 6;

export type Screen =
  | { name: "language" }
  | { name: "home" }
  | { name: "upload" }
  | { name: "lesson"; reading: FormReading; index: number }
  | { name: "quiz"; termIds: string[]; reading?: FormReading; index?: number }
  | { name: "practice"; suggested?: string[] }
  | { name: "scenario"; id: string };

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
        setServerVoice(c.features.voice);
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
    if (language) {
      document.title = language.ui.app_title ?? "Form Helper";
      setLearnerBrowserLang(language.browser_tts_lang);
    }
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
      /* private browsing: keep it for this visit */
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
      {screen.name === "upload" && <Upload go={go} />}
      {screen.name === "lesson" && (
        <LessonScreen key={`${screen.index}`} reading={screen.reading} index={screen.index} go={go} />
      )}
      {screen.name === "quiz" && (
        <QuizScreen
          termIds={screen.termIds}
          teacher={teacher}
          go={go}
          reading={screen.reading}
          index={screen.index}
        />
      )}
      {screen.name === "practice" && <Practice go={go} suggested={screen.suggested} />}
      {screen.name === "scenario" && <ScenarioScreen key={screen.id} id={screen.id} go={go} />}
    </LangProvider>
  );
}
