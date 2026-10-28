// The learning path: one page with every practice paper, the talking
// practice, and the quizzes. Each paper starts with "look at it" (tap any
// word) and then short lessons of about 3 tricky words. A word taught on an
// earlier paper is not taught again, so later papers build on earlier ones.

import type { ConceptSummary, Paper, ScenarioSummary } from "./types";

export type PathNode =
  | { id: string; kind: "explore"; paper: Paper }
  | { id: string; kind: "story"; concept: ConceptSummary }
  | { id: string; kind: "lesson"; paper: Paper; words: string[]; labels: string[] }
  | { id: string; kind: "talk"; scenario: ScenarioSummary }
  | { id: string; kind: "quiz"; words: string[]; paper?: Paper };

export interface Unit {
  id: string;
  color: string;
  paper?: Paper;
  titleKey?: string;
  nodes: PathNode[];
}

const COLORS = ["teal", "blue", "pink", "green", "indigo"];
const LESSON_SIZE = 3;

export function paperTerms(p: Paper) {
  return p.terms ?? p.reading?.terms ?? [];
}

function groups<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += LESSON_SIZE) out.push(items.slice(i, i + LESSON_SIZE));
  // Never leave one word alone in a lesson.
  if (out.length > 1 && out[out.length - 1].length === 1) out[out.length - 2].push(...out.pop()!);
  return out;
}

export function buildPath(papers: Paper[], concepts: ConceptSummary[], scenarios: ScenarioSummary[]): Unit[] {
  const taught = new Set<string>();
  const units: Unit[] = [];
  const quizzes: PathNode[] = [];

  papers.forEach((paper, i) => {
    const terms = paperTerms(paper);
    // On the card every word matters; on longer papers, teach the tricky ones.
    const teach = (paper.kind === "card" ? terms : terms.filter((t) => t.confusing)).filter((t) => !taught.has(t.id));
    teach.forEach((t) => taught.add(t.id));
    const lessons: PathNode[] = groups(teach).map((g, j) => ({
      id: `${paper.id}:lesson:${j}`,
      kind: "lesson",
      paper,
      words: g.map((t) => t.id),
      labels: g.map((t) => t.term),
    }));
    units.push({
      id: paper.id,
      color: COLORS[i % COLORS.length],
      paper,
      nodes: [
        { id: `${paper.id}:explore`, kind: "explore", paper },
        // "How it works" goes right after looking at the paper, before the word lessons.
        ...concepts
          .filter((c) => c.paper === paper.id)
          .map((c): PathNode => ({ id: `story:${c.id}`, kind: "story", concept: c })),
        ...lessons,
      ],
    });
    if (teach.length) quizzes.push({ id: `${paper.id}:quiz`, kind: "quiz", words: teach.map((t) => t.id), paper });
  });

  units.push({
    id: "talk",
    color: "orange",
    titleKey: "unit_talk",
    nodes: scenarios.map((s) => ({ id: `talk:${s.id}`, kind: "talk", scenario: s })),
  });
  units.push({
    id: "quiz",
    color: "violet",
    titleKey: "unit_quiz",
    nodes: [...quizzes, { id: "quiz:all", kind: "quiz", words: [...taught] }],
  });
  return units;
}
