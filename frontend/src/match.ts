// Checks a spoken line against the script. Speech recognition is never
// perfect, especially with accents, so this is forgiving: a line passes when
// most of its words were heard, and close spellings ("copay" / "co pay")
// count. The point is to build confidence, not to grade pronunciation.

export const PASS = 0.6;

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  ten: "10", eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30",
};

/** Lowercase words with punctuation, ordinals, and number words smoothed out. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/o'clock/g, "oclock")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/['’]/g, "")
    .replace(/-/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w);
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return editDistance(a, b) <= Math.floor(Math.max(a.length, b.length) / 4);
}

export interface Check {
  score: number;
  passed: boolean;
  /** One entry per word of the original line, as written: was it heard? */
  shown: { text: string; heard: boolean }[];
}

/** Compare what was heard with the scripted line. */
export function checkLine(target: string, heardOptions: string[]): Check {
  let best: Check | null = null;
  for (const heard of heardOptions.length ? heardOptions : [""]) {
    const result = checkOne(target, heard);
    if (!best || result.score > best.score) best = result;
  }
  return best!;
}

function checkOne(target: string, heard: string): Check {
  const said = words(heard);
  // Also allow two heard words that join into one ("co pay" for "copay").
  const pairs = said.slice(1).map((w, i) => said[i] + w);
  const pool = [...said, ...pairs];
  const used = new Set<number>();

  const shown = target.split(/\s+/).filter(Boolean).map((text) => {
    const parts = words(text);
    const heardAll = parts.every((p) => {
      const at = pool.findIndex((w, i) => !used.has(i) && close(p, w));
      if (at < 0) return false;
      used.add(at);
      return true;
    });
    return { text, heard: parts.length === 0 || heardAll };
  });

  const counted = shown.filter((s) => words(s.text).length > 0);
  const score = counted.length ? counted.filter((s) => s.heard).length / counted.length : 0;
  return { score, passed: score >= PASS, shown };
}
