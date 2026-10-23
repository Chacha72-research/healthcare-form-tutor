"""Builds short English quizzes straight from the glossary.

Two question types, both checkable without an AI call:
  * meaning: show the plain definition, pick the matching word
  * fill:    show the example sentence with the word blanked out, pick the word

Because questions come from the same vetted glossary the explainer uses,
a pre-lesson and post-lesson quiz on the same terms measure the same thing.
"""

from __future__ import annotations

import random
import re

from .content import Content, Term

BLANK = "_____"


def _term_pattern(text: str) -> re.Pattern[str]:
    return re.compile(r"(?<![\w])" + re.escape(text) + r"(?![\w])", re.IGNORECASE)


def blank_example(term: Term) -> str | None:
    """Return the example sentence with the term (or an alias) replaced by a blank."""
    candidates = [term.term, *sorted(term.aliases, key=len, reverse=True)]
    for text in candidates:
        pattern = _term_pattern(text)
        if pattern.search(term.example):
            return pattern.sub(BLANK, term.example, count=1)
    return None


def _pick_terms(content: Content, term_ids: list[str] | None, n: int, rng: random.Random) -> list[Term]:
    chosen: list[Term] = []
    seen: set[str] = set()
    for tid in term_ids or []:
        term = content.terms_by_id.get(tid)
        if term and tid not in seen:
            chosen.append(term)
            seen.add(tid)
        if len(chosen) == n:
            break

    if len(chosen) < n:
        rest = [t for t in content.terms if t.id not in seen]
        rng.shuffle(rest)
        chosen.extend(rest[: n - len(chosen)])

    rng.shuffle(chosen)
    return chosen


def _distractors(content: Content, term: Term, qtype: str, rng: random.Random, k: int = 3) -> list[Term]:
    same = [t for t in content.terms if t.id != term.id and t.category == term.category]
    other = [t for t in content.terms if t.id != term.id and t.category != term.category]
    rng.shuffle(same)
    rng.shuffle(other)
    # Meaning questions: similar words make the learner read the definition closely.
    # Fill-in-the-blank: words from other topics, so only one answer fits the sentence.
    pool = same + other if qtype == "meaning" else other + same
    return pool[:k]


def build_quiz(
    content: Content,
    term_ids: list[str] | None = None,
    n: int = 8,
    seed: int | str | None = None,
) -> dict:
    n = max(1, min(n, len(content.terms)))
    rng = random.Random(seed)
    terms = _pick_terms(content, term_ids, n, rng)

    questions = []
    for i, term in enumerate(terms):
        qtype = "meaning" if i % 2 == 0 else "fill"
        prompt = term.definition
        if qtype == "fill":
            blanked = blank_example(term)
            if blanked is None:
                qtype = "meaning"
            else:
                prompt = blanked

        options = [term, *_distractors(content, term, qtype, rng)]
        rng.shuffle(options)
        questions.append(
            {
                "id": f"q{i + 1}",
                "term_id": term.id,
                "type": qtype,
                "prompt": prompt,
                "options": [{"id": t.id, "label": t.term} for t in options],
                "answer_id": term.id,
                "definition": term.definition,
                "example": term.example,
            }
        )

    return {"questions": questions, "total": len(questions)}
