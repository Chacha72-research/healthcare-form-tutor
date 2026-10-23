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

export interface Scenario {
  id: string;
  title: Record<string, string>;
  icon: string;
}

export interface AppConfig {
  languages: Language[];
  english_ui: UIStrings;
  scenarios: Scenario[];
  features: { scan: boolean; conversation: boolean; server_tts: boolean };
}

export interface ExplainedTerm {
  id: string;
  term: string;
  category: string;
  definition: string;
  example: string;
  form_text: string;
  explanation: string;
  explanation_source: "vetted" | "ai";
}

export interface ExplainResponse {
  readable: boolean;
  form_summary: string;
  terms: ExplainedTerm[];
  unlisted_terms: string[];
}

export interface QuizQuestion {
  id: string;
  term_id: string;
  type: "meaning" | "fill";
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

/** Set by a teacher's link, like /?phase=pre&learner=A3&terms=copay,deductible */
export interface TeacherParams {
  phase: "pre" | "post" | "practice";
  learner: string;
  terms: string[];
  seed: string | null;
}
