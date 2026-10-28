// Remembers, on this device only, which words the learner has studied and
// missed, so the next lesson can start with a quick review (spaced practice).

const KEY = "form-helper-words";

interface Saved {
  learned: string[];
  missed: string[];
}

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { learned: data.learned ?? [], missed: data.missed ?? [] };
    }
  } catch {
    /* private mode or bad data */
  }
  return { learned: [], missed: [] };
}

function write(data: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* fine */
  }
}

export function markLearned(ids: string[]) {
  const data = read();
  data.learned = [...new Set([...data.learned, ...ids])].slice(-200);
  write(data);
}

export function recordQuiz(results: { term_id: string; correct: boolean }[]) {
  const data = read();
  const missed = new Set(data.missed);
  for (const r of results) {
    if (r.correct) missed.delete(r.term_id);
    else missed.add(r.term_id);
  }
  data.missed = [...missed].slice(-50);
  write(data);
}

/** A word studied before (missed ones first) that is not in today's lesson. */
export function reviewWord(exclude: string[]): string | null {
  const data = read();
  const skip = new Set(exclude);
  const missed = data.missed.filter((id) => !skip.has(id));
  if (missed.length) return missed[missed.length - 1];
  const learned = data.learned.filter((id) => !skip.has(id));
  return learned.length ? learned[Math.floor(Math.random() * learned.length)] : null;
}

// Which circles on the learning path are finished, on this device only.
const DONE_KEY = "form-helper-done";

export function getDone(): string[] {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markDone(id: string) {
  try {
    const done = new Set(getDone());
    done.add(id);
    localStorage.setItem(DONE_KEY, JSON.stringify([...done].slice(-200)));
  } catch {
    /* private mode: progress lasts for this visit only */
  }
}
