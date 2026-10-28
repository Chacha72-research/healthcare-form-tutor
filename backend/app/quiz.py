"""Builds short English quizzes straight from the glossary (no AI).

Questions follow the questioning hierarchy used with English learners: the
easiest kinds come first, so beginners build confidence before harder ones.

  1. either_or  "Which one is it?"   2 choices
  2. yes_no     "Yes or no?"         does this word mean this?
  3. meaning    "Which word matches?" 4 choices
  4. fill       "Which word goes in the blank?" 4 choices, in an example sentence

Because the questions come from the same glossary the lessons use, a
before-lesson and after-lesson quiz with the same seed measure the same thing.
"""

from __future__ import annotations

import random
import re

from .content import Content, Term

BLANK = "_____"
ORDER = ["either_or", "yes_no", "meaning", "fill"]


def _term_pattern(text: str) -> re.Pattern[str]:
    return re.compile(r"(?<![\w])" + re.escape(text) + r"(?![\w])", re.IGNORECASE)


def blank_example(term: Term) -> str | None:
    """Return the example sentence with the term (or an alias) replaced by a blank."""
    for text in [term.term, *sorted(term.aliases, key=len, reverse=True)]:
        pattern = _term_pattern(text)
        if pattern.search(term.example):
            return pattern.sub(BLANK, term.example, count=1)
    return None


def _band_sizes(n: int) -> list[int]:
    base, extra = divmod(n, len(ORDER))
    return [base + (1 if i < extra else 0) for i in range(len(ORDER))]


def _distractors(content: Content, term: Term, k: int, rng: random.Random, same_topic_first: bool) -> list[Term]:
    same = [t for t in content.terms if t.id != term.id and t.category == term.category]
    other = [t for t in content.terms if t.id != term.id and t.category != term.category]
    rng.shuffle(same)
    rng.shuffle(other)
    pool = same + other if same_topic_first else other + same
    return pool[:k]


def _options(terms: list[Term]) -> list[dict]:
    return [{"id": t.id, "label": t.term} for t in terms]


def build_quiz(
    content: Content,
    term_ids: list[str] | None = None,
    n: int = 8,
    seed: int | str | None = None,
) -> dict:
    rng = random.Random(seed)
    chosen = [content.terms_by_id[t] for t in dict.fromkeys(term_ids or []) if t in content.terms_by_id]
    if chosen:
        # Short word lists get a shorter quiz; every word is still seen in several ways.
        n = max(1, min(n, max(4, 2 * len(chosen))))
    else:
        # No words given: practice the tricky ones, the words learners mix up most.
        pool = [t for t in content.terms if t.confusing] or list(content.terms)
        rng.shuffle(pool)
        chosen = pool[: max(1, min(n, len(pool)))]
    rng.shuffle(chosen)

    questions: list[dict] = []
    i = 0
    for qtype, size in zip(ORDER, _band_sizes(n)):
        for _ in range(size):
            term = chosen[i % len(chosen)]
            i += 1
            q = _question(content, term, qtype, rng)
            q["id"] = f"q{len(questions) + 1}"
            questions.append(q)

    return {"questions": questions, "total": len(questions)}


def _question(content: Content, term: Term, qtype: str, rng: random.Random) -> dict:
    base = {"term_id": term.id, "term": term.term, "definition": term.definition, "example": term.example}

    if qtype == "fill":
        blanked = blank_example(term)
        if blanked is None:
            qtype = "meaning"
        else:
            options = [term, *_distractors(content, term, 3, rng, same_topic_first=False)]
            rng.shuffle(options)
            return {**base, "type": "fill", "prompt": blanked, "options": _options(options), "answer_id": term.id}

    if qtype == "either_or":
        options = [term, *_distractors(content, term, 1, rng, same_topic_first=True)]
        rng.shuffle(options)
        return {**base, "type": "either_or", "prompt": term.definition, "options": _options(options), "answer_id": term.id}

    if qtype == "yes_no":
        matches = rng.random() < 0.5
        shown = term if matches else _distractors(content, term, 1, rng, same_topic_first=True)[0]
        return {
            **base,
            "type": "yes_no",
            "word": term.term,
            "prompt": shown.definition,
            "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}],
            "answer_id": "yes" if matches else "no",
        }

    options = [term, *_distractors(content, term, 3, rng, same_topic_first=True)]
    rng.shuffle(options)
    return {**base, "type": "meaning", "prompt": term.definition, "options": _options(options), "answer_id": term.id}
