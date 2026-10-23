import type { AppConfig, ExplainResponse, Quiz } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(resp.status, String(detail));
  }
  return resp.json() as Promise<T>;
}

export const getConfig = () => fetch("/api/config").then((r) => json<AppConfig>(r));

export function explainForm(photo: Blob, language: string): Promise<ExplainResponse> {
  const body = new FormData();
  body.append("file", photo, "form.jpg");
  body.append("language", language);
  return fetch("/api/explain", { method: "POST", body }).then((r) => json<ExplainResponse>(r));
}

export function getQuiz(termIds: string[], seed: string | null): Promise<Quiz> {
  const params = new URLSearchParams({ n: "8" });
  if (termIds.length) params.set("terms", termIds.join(","));
  if (seed) params.set("seed", seed);
  return fetch(`/api/quiz?${params}`).then((r) => json<Quiz>(r));
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
