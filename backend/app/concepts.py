"""Short "how it works" stories: how insurance works, who pays what, what to do
with a bill, where to go for care, and your rights at the clinic.

Each card has one short, simple English sentence (about 4th grade) and a
fuller adult explanation that is shown in the learner's language. The
translations come from the same saved, teacher-reviewable cache as the rest
of the app.
"""

from __future__ import annotations

import json
from functools import lru_cache

from .config import DATA_DIR
from .content import Language
from .lessons import LessonService


@lru_cache(maxsize=1)
def load_concepts() -> list[dict]:
    return json.loads((DATA_DIR / "concepts.json").read_text(encoding="utf-8"))["concepts"]


def summaries() -> list[dict]:
    return [{k: c[k] for k in ("id", "paper", "icon", "title")} for c in load_concepts()]


def concept_lines(concept: dict) -> list[str]:
    lines: list[str] = []
    for card in concept["cards"]:
        lines += [card["say"], card["explain"]]
    for check in concept["checks"]:
        lines += [check["q"], *check["options"]]
    return lines


async def concept_lesson(lessons: LessonService, concept_id: str, language: Language) -> dict | None:
    concept = next((c for c in load_concepts() if c["id"] == concept_id), None)
    if concept is None:
        return None
    tr, err = await lessons._safely(lessons.translate(concept_lines(concept), language), {})
    return {
        "id": concept["id"],
        "icon": concept["icon"],
        "title": concept["title"],
        "cards": [
            {**card, "say_l1": tr.get(card["say"]), "explain_l1": tr.get(card["explain"])} for card in concept["cards"]
        ],
        "checks": [
            {**check, "q_l1": tr.get(check["q"]), "options_l1": [tr.get(o) for o in check["options"]]}
            for check in concept["checks"]
        ],
        "ai_error": err,
        "ai_available": lessons.ai is not None,
    }
