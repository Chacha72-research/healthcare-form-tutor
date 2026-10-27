import type { AppConfig, FormReading, Lesson, Quiz, ScenarioDetail } from "./types";

/** `code` matches a UI string key where possible, like "ai_busy" or "picture_needs_ai". */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let code = "error_generic";
    try {
      const detail = (await resp.json()).detail;
      if (detail && typeof detail === "object" && "code" in detail) code = String(detail.code);
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(resp.status, code);
  }
  return resp.json() as Promise<T>;
}

export const getConfig = () => fetch("/api/config").then((r) => json<AppConfig>(r));

export function readForm(file: Blob, name: string): Promise<FormReading> {
  const body = new FormData();
  body.append("file", file, name);
  return fetch("/api/forms/read", { method: "POST", body }).then((r) => json<FormReading>(r));
}

export function getLesson(termIds: string[], language: string): Promise<Lesson> {
  const params = new URLSearchParams({ terms: termIds.join(","), language });
  return fetch(`/api/lesson?${params}`).then((r) => json<Lesson>(r));
}

export function getQuiz(termIds: string[], seed: string | null): Promise<Quiz> {
  const params = new URLSearchParams({ n: "8" });
  if (termIds.length) params.set("terms", termIds.join(","));
  if (seed) params.set("seed", seed);
  return fetch(`/api/quiz?${params}`).then((r) => json<Quiz>(r));
}

export function getScenario(id: string, language: string): Promise<ScenarioDetail> {
  const params = new URLSearchParams({ language });
  return fetch(`/api/scenarios/${encodeURIComponent(id)}?${params}`).then((r) => json<ScenarioDetail>(r));
}

export function saveQuizResult(result: {
  learner_code: string;
  phase: string;
  language: string;
  answers: { term_id: string; type: string; correct: boolean }[];
}) {
  return fetch("/api/quiz/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  }).then((r) => json<{ score: number; total: number }>(r));
}

export function conversationUrl(scenario: string, language: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const params = new URLSearchParams({ scenario, language });
  return `${proto}://${location.host}/ws/conversation?${params}`;
}
