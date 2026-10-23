"""Loads the glossary, languages, and scenarios from backend/data."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from .config import DATA_DIR


@dataclass(frozen=True)
class Term:
    id: str
    term: str
    aliases: tuple[str, ...]
    category: str
    definition: str
    example: str
    vetted: bool = False
    translations: dict[str, str] = field(default_factory=dict)

    def public(self) -> dict:
        return {
            "id": self.id,
            "term": self.term,
            "category": self.category,
            "definition": self.definition,
            "example": self.example,
        }


@dataclass(frozen=True)
class Language:
    code: str
    english_name: str
    native_name: str
    tts_lang: str
    browser_tts_lang: str
    dir: str
    ui: dict[str, str]


@dataclass
class Content:
    terms: list[Term]
    languages: list[Language]
    english_ui: dict[str, str]
    scenarios: list[dict]

    def __post_init__(self) -> None:
        self.terms_by_id = {t.id: t for t in self.terms}
        self.languages_by_code = {lang.code: lang for lang in self.languages}
        self.scenarios_by_id = {s["id"]: s for s in self.scenarios}

    def language(self, code: str) -> Language | None:
        return self.languages_by_code.get(code)


def _read(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_content(data_dir: Path = DATA_DIR) -> Content:
    glossary = _read(data_dir / "glossary.json")
    langs = _read(data_dir / "languages.json")
    scenarios = _read(data_dir / "scenarios.json")

    terms = [
        Term(
            id=t["id"],
            term=t["term"],
            aliases=tuple(t.get("aliases", [])),
            category=t["category"],
            definition=t["definition"],
            example=t["example"],
            vetted=bool(t.get("vetted", False)),
            translations=dict(t.get("translations", {})),
        )
        for t in glossary["terms"]
    ]
    languages = [
        Language(
            code=lang["code"],
            english_name=lang["english_name"],
            native_name=lang["native_name"],
            tts_lang=lang["tts_lang"],
            browser_tts_lang=lang.get("browser_tts_lang", lang["tts_lang"]),
            dir=lang.get("dir", "ltr"),
            ui=lang.get("ui", {}),
        )
        for lang in langs["languages"]
    ]
    return Content(
        terms=terms,
        languages=languages,
        english_ui=langs["english_ui"],
        scenarios=scenarios["scenarios"],
    )


@lru_cache(maxsize=1)
def get_content() -> Content:
    return load_content()
