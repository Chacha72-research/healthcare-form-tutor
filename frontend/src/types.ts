export type UIStrings = Record<string, string>;

export interface Language {
  code: string;
  english_name: string;
  native_name: string;
  tts_lang: string;
  browser_tts_lang: string;
  dir: "ltr" | "rtl";
  ui: UIStrings;
}

export interface ScenarioSummary {
  id: string;
  icon: string;
  title: Record<string, string>;
  goal: Record<string, string>;
  staff_label: string;
  target_terms: string[];
}

export interface PretendPatient {
  name: string;
  date_of_birth: string;
  plan: string;
  plan_type: string;
  member_id: string;
  group_number: string;
  primary_care_provider: string;
  copays: Record<string, string>;
  deductible: string;
  member_services_phone: string;
}

export interface AppConfig {
  languages: Language[];
  english_ui: UIStrings;
  scenarios: ScenarioSummary[];
  pretend_patient: PretendPatient;
  features: { ai: boolean; voice: boolean; live: boolean };
}

export interface FormMark {
  start: number;
  end: number;
  term_id: string;
}

export interface FormReading {
  source: "text" | "ai";
  lines: { text: string; marks: FormMark[] }[];
  terms: { id: string; term: string; form_text: string; confusing: boolean }[];
  unlisted: string[];
}

/** A built-in practice paper: a form, the insurance card, an EOB, a bill, or a benefits summary. */
export interface Paper {
  id: string;
  kind: "pdf" | "text" | "card";
  icon: string;
  title: Record<string, string>;
  about: Record<string, string>;
  reading?: FormReading;
  terms?: { id: string; term: string; confusing: boolean }[];
}

export type Actor = "you" | "clinic" | "insurance";

/** A short "how it works" story on the path. */
export interface ConceptSummary {
  id: string;
  paper: string;
  icon: string;
  title: Record<string, string>;
}

export interface ConceptStory extends ConceptSummary {
  cards: {
    icon: string;
    say: string;
    explain: string;
    say_l1: string | null;
    explain_l1: string | null;
    /** Only in the big picture: who sends what to whom */
    from?: Actor;
    to?: Actor;
    token?: string;
    paper?: string;
  }[];
  checks: { q: string; options: string[]; answer: string; q_l1: string | null; options_l1: (string | null)[] }[];
  ai_error: string | null;
}

export interface CheckQuestions {
  either_or: { q: string; options: string[]; answer: string };
  yes_no: { q: string; answer: boolean };
}

/** A glossary word in plain English, written and checked by a teacher. */
export interface GlossaryTerm {
  id: string;
  term: string;
  say: string;
  category: string;
  confusing: boolean;
  definition: string;
  example: string;
  tip: string;
  check: CheckQuestions;
}

export interface ExplainedTerm extends GlossaryTerm {
  l1: {
    meaning: string | null;
    example_meaning: string | null;
    tip: string | null;
    approved: boolean;
  };
}

export interface Explained {
  terms: ExplainedTerm[];
  ai_error: string | null;
  ai_available: boolean;
}

/** A word with its learner-language text and translated check questions, for lessons. */
export interface LessonWord extends GlossaryTerm {
  l1: {
    meaning: string | null;
    example_meaning: string | null;
    tip: string | null;
    either_or_q: string | null;
    either_or_options: (string | null)[];
    yes_no_q: string | null;
    approved: boolean;
  };
}

export interface Lesson {
  words: LessonWord[];
  ai_error: string | null;
  ai_available: boolean;
}

export interface QuizQuestion {
  id: string;
  term_id: string;
  term: string;
  type: "either_or" | "yes_no" | "meaning" | "fill";
  word?: string;
  prompt: string;
  options: { id: string; label: string }[];
  answer_id: string;
  definition: string;
  example: string;
}

export interface Quiz {
  questions: QuizQuestion[];
  total: number;
}

export interface ScenarioDetail {
  id: string;
  icon: string;
  title: Record<string, string>;
  goal: Record<string, string>;
  staff_label: string;
  casas: string[];
  el_civics: string;
  terms: { id: string; term: string; definition: string }[];
  dialogue: { who: "staff" | "you"; text: string; l1: string | null }[];
  useful_phrases: { text: string; l1: string | null }[];
  questions: {
    type: "either_or" | "yes_no" | "wh";
    q: string;
    q_l1: string | null;
    options: string[];
    options_l1: (string | null)[];
    answer: string | boolean;
  }[];
  ai_error: string | null;
  ai_available: boolean;
}

/** Set by a teacher's link, like /?phase=pre&learner=A3&terms=copay,deductible */
export interface TeacherParams {
  phase: "pre" | "post" | "practice";
  learner: string;
  terms: string[];
  seed: string | null;
}
