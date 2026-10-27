import type { ReactNode } from "react";

/** Shows text with a word highlighted like a yellow marker. */
export function Marked({ text, words, className = "hl-soft" }: { text: string; words: string[]; className?: string }) {
  const escaped = words
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]/g, "[-\\s]?"));
  if (!escaped.length) return <>{text}</>;
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} className={className}>
        {m[0]}
      </mark>,
    );
    last = i + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
