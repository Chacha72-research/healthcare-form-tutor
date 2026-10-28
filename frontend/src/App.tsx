import { useEffect, useMemo, useState } from "react";
import { getConfig, getPapers } from "./api";
import { LangProvider, makeLangValue } from "./i18n";
import { setLearnerBrowserLang, setServerVoice, stopSpeaking } from "./speech";
import type { AppConfig, ConceptSummary, Paper, TeacherParams } from "./types";
import { LanguagePicker } from "./screens/LanguagePicker";
import { PathScreen } from "./screens/Path";
import { ExploreScreen } from "./screens/Explore";
import { LessonScreen } from "./screens/Lesson";
import { QuizScreen } from "./screens/Quiz";
import { SpeakScreen } from "./screens/Speak";
import { StoryScreen } from "./screens/Story";

// "home" is the learning path. Everything starts and ends there.
export type Screen =
  | { name: "language" }
  | { name: "home" }
  | { name: "explore"; paper: string; nodeId: string }
  | { name: "story"; id: string; paper: string; nodeId: string }
  | { name: "lesson"; paper: string; words: string[]; nodeId: string }
  | { name: "quiz"; termIds: string[]; nodeId?: string; big?: boolean }
  | { name: "speak"; id: string; nodeId?: string };

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
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [concepts, setConcepts] = useState<ConceptSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [langCode, setLangCode] = useState<string | null>(savedLanguage);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const teacher = useMemo(readTeacherParams, []);

  useEffect(() => {
    Promise.all([getConfig(), getPapers()])
      .then(([c, p]) => {
        setConfig(c);
        setPapers(p.forms);
        setConcepts(p.concepts);
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
  if (!config || !papers) return <main className="page" aria-busy="true" />;

  if (!language || screen.name === "language") {
    return <LanguagePicker config={config} current={langCode} onChoose={chooseLanguage} />;
  }

  const paper = (id: string) => papers.find((p) => p.id === id)!;

  return (
    <LangProvider value={makeLangValue(config, language)}>
      {screen.name === "home" && <PathScreen papers={papers} concepts={concepts} go={go} />}
      {screen.name === "story" && <StoryScreen key={screen.id} id={screen.id} nodeId={screen.nodeId} go={go} />}
      {screen.name === "explore" && (
        <ExploreScreen key={screen.paper} paper={paper(screen.paper)} nodeId={screen.nodeId} go={go} />
      )}
      {screen.name === "lesson" && (
        <LessonScreen key={screen.nodeId} paper={paper(screen.paper)} words={screen.words} nodeId={screen.nodeId} go={go} />
      )}
      {screen.name === "quiz" && (
        <QuizScreen key={screen.nodeId} termIds={screen.termIds} teacher={teacher} go={go} nodeId={screen.nodeId} big={screen.big} />
      )}
      {screen.name === "speak" && <SpeakScreen key={screen.id} id={screen.id} nodeId={screen.nodeId} go={go} />}
    </LangProvider>
  );
}
