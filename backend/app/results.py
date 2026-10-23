"""Stores quiz results as JSON lines so teachers can compare before and after.

Only a short learner code (like "A3") is stored, never a name.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

_lock = threading.Lock()


class Answer(BaseModel):
    term_id: str = Field(max_length=64)
    type: Literal["meaning", "fill"]
    correct: bool


class QuizResult(BaseModel):
    learner_code: str = Field(default="", max_length=20, pattern=r"^[A-Za-z0-9_-]*$")
    phase: Literal["pre", "post", "practice"] = "practice"
    language: str = Field(default="", max_length=16)
    answers: list[Answer] = Field(max_length=50)


def save_result(result: QuizResult, path: Path) -> dict:
    score = sum(1 for a in result.answers if a.correct)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "learner_code": result.learner_code.upper(),
        "phase": result.phase,
        "language": result.language,
        "score": score,
        "total": len(result.answers),
        "answers": [a.model_dump() for a in result.answers],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with _lock, path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"score": score, "total": len(result.answers)}
