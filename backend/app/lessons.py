"""Builds lessons and practice units in the learner's language.

The teaching steps are fixed (see the tutor_* lines in languages.json and the
check questions in glossary.json). The AI only fills in the learner's-language
parts: a casual spoken meaning for each word, and translations of short
English lines. Whatever it writes is saved in backend/data/generated/<lang>.json,
so each word is only generated once, every learner gets the same text, and a
teacher can review it and mark it approved.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from .ai import AIError, AIProvider
from .content import Content, Language

log = logging.getLogger(__name__)

TERM_BATCH = 8
LINE_BATCH = 40

STYLE = {
    "ta": (
        "Write in everyday spoken Tamil (பேச்சுத் தமிழ்) with respectful forms like நீங்க and "
        "சொல்லுங்க, not formal written Tamil. Common loanwords like டாக்டர், இன்ஷூரன்ஸ், ஃபார்ம் are fine."
    ),
    "es": "Use Latin American Spanish and the friendly 'tú' form.",
    "zh-Hans": "Use Simplified Chinese characters and plain spoken Mandarin.",
    "vi": "Use 'bạn' and everyday spoken Vietnamese.",
}

TERM_SYSTEM = """You help adult beginners (English level 1 to 2) understand words on U.S. healthcare forms. Their first language is {lang}. You write what a warm, casual tutor would say out loud in {lang}.

For each glossary term:
- meaning: one or two short sentences in everyday spoken {lang} that explain the English definition. Sound like a friendly person talking, not a dictionary. Say only what the definition says. Do not add facts, numbers, prices, rules, or medical advice. Keep the English term itself in English letters (for example: copay) so the learner connects the sound to the written word.
- example_meaning: a natural {lang} translation of the English example sentence. Keep the English term in English letters.
- tip: a natural {lang} translation of the English tip, which tells the learner what to write on the form or what to do. Keep it just as short. Keep English words that appear on forms (like N/A, Member ID) in English letters.
{style}"""

TERM_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term_id": {"type": "string"},
                    "meaning": {"type": "string"},
                    "example_meaning": {"type": "string"},
                    "tip": {"type": "string"},
                },
                "required": ["term_id", "meaning", "example_meaning", "tip"],
            },
        }
    },
    "required": ["items"],
}

TRANSLATE_SYSTEM = """You translate short English lines into {lang} for adult beginners who are learning English for healthcare situations. Keep every translation plain, natural, and faithful to the English. Keep names, numbers, money amounts, dates, and times exactly the same. When a line contains a healthcare word (like copay, deductible, in-network, referral, prescription), keep that word in English letters inside the translation so the learner can match it to the English.
{style}"""

TRANSLATE_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "integer"}, "text": {"type": "string"}},
                "required": ["id", "text"],
            },
        }
    },
    "required": ["items"],
}


class GeneratedStore:
    """One JSON file per language holding AI-written text, so it's made once and can be reviewed."""

    def __init__(self, directory: Path):
        self.directory = directory
        self._cache: dict[str, dict] = {}
        self._lock = asyncio.Lock()

    def path(self, lang: str) -> Path:
        return self.directory / f"{lang}.json"

    def load(self, lang: str) -> dict:
        if lang not in self._cache:
            data = {"terms": {}, "lines": {}}
            p = self.path(lang)
            if p.exists():
                with p.open(encoding="utf-8") as f:
                    loaded = json.load(f)
                data["terms"].update(loaded.get("terms", {}))
                data["lines"].update(loaded.get("lines", {}))
            self._cache[lang] = data
        return self._cache[lang]

    def save(self, lang: str) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        tmp = self.path(lang).with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(self._cache[lang], f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp, self.path(lang))

    @property
    def lock(self) -> asyncio.Lock:
        return self._lock


def _fill_language(text: str, language: Language) -> str:
    name = language.english_name.split(" (")[0]
    return text.replace("{language}", name)


class LessonService:
    def __init__(self, content: Content, store: GeneratedStore, ai: AIProvider | None):
        self.content = content
        self.store = store
        self.ai = ai

    # ---------- AI-backed pieces, cached ----------

    async def term_texts(self, term_ids: list[str], language: Language) -> dict[str, dict]:
        data = self.store.load(language.code)

        def needs(tid: str) -> bool:
            # Older saved entries have no tip yet; fill those in too.
            return tid not in data["terms"] or "tip" not in data["terms"][tid]

        missing = [tid for tid in term_ids if needs(tid)]
        if missing and self.ai is not None:
            async with self.store.lock:
                missing = [tid for tid in missing if needs(tid)]
                batches = [missing[i : i + TERM_BATCH] for i in range(0, len(missing), TERM_BATCH)]
                # Run the batches side by side so a whole form is ready in seconds.
                results = await asyncio.gather(
                    *(self._generate_terms(b, language, data) for b in batches), return_exceptions=True
                )
                if missing:
                    self.store.save(language.code)
                errors = [r for r in results if isinstance(r, Exception)]
                if errors and len(errors) == len(results):
                    raise errors[0]
        return {tid: data["terms"][tid] for tid in term_ids if tid in data["terms"]}

    async def _generate_terms(self, term_ids: list[str], language: Language, data: dict) -> None:
        listing = "\n".join(
            f"{t.id} | {t.term} | definition: {t.definition} | example: {t.example} | tip: {t.tip}"
            for t in (self.content.terms_by_id[tid] for tid in term_ids)
        )
        result = await self.ai.generate_json(
            system=TERM_SYSTEM.format(lang=language.english_name, style=STYLE.get(language.code, "")),
            prompt=f"Write the meaning, example_meaning, and tip for each term.\n\nid | term | definition | example | tip\n{listing}",
            schema=TERM_SCHEMA,
        )
        for item in result.get("items") or []:
            tid = str(item.get("term_id", ""))
            meaning = str(item.get("meaning", "")).strip()
            if tid in term_ids and meaning:
                data["terms"][tid] = {
                    "meaning": meaning,
                    "example_meaning": str(item.get("example_meaning", "")).strip(),
                    "tip": str(item.get("tip", "")).strip(),
                    "approved": False,
                }

    async def translate(self, texts: list[str], language: Language) -> dict[str, str]:
        data = self.store.load(language.code)
        unique = list(dict.fromkeys(t for t in texts if t))
        missing = [t for t in unique if t not in data["lines"]]
        if missing and self.ai is not None:
            async with self.store.lock:
                missing = [t for t in missing if t not in data["lines"]]
                for i in range(0, len(missing), LINE_BATCH):
                    await self._generate_lines(missing[i : i + LINE_BATCH], language, data)
                if missing:
                    self.store.save(language.code)
        return {t: data["lines"][t]["text"] for t in unique if t in data["lines"]}

    async def _generate_lines(self, lines: list[str], language: Language, data: dict) -> None:
        listing = "\n".join(f"{i} | {line}" for i, line in enumerate(lines))
        result = await self.ai.generate_json(
            system=TRANSLATE_SYSTEM.format(lang=language.english_name, style=STYLE.get(language.code, "")),
            prompt=f"Translate each line. Return the same id with each translation.\n\nid | English\n{listing}",
            schema=TRANSLATE_SCHEMA,
        )
        for item in result.get("items") or []:
            try:
                idx = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            text = str(item.get("text", "")).strip()
            if 0 <= idx < len(lines) and text:
                data["lines"][lines[idx]] = {"text": text, "approved": False}

    async def _safely(self, coro, fallback):
        """Lessons still work in English if the AI is missing, busy, or fails."""
        try:
            return await coro, None
        except AIError as exc:
            return fallback, exc.code

    # ---------- What the API returns ----------

    async def explain(self, term_ids: list[str], language: Language) -> dict:
        """Everything the form screen shows for each word: English from the glossary,
        plus the meaning, example, and what-to-write tip in the learner's language."""
        terms = [self.content.terms_by_id[t] for t in dict.fromkeys(term_ids) if t in self.content.terms_by_id]
        texts, err = await self._safely(self.term_texts([t.id for t in terms], language), {})
        out = []
        for t in terms:
            g = texts.get(t.id) or {}
            out.append(
                {
                    **t.public(),
                    "l1": {
                        "meaning": g.get("meaning"),
                        "example_meaning": g.get("example_meaning"),
                        "tip": g.get("tip"),
                        "approved": bool(g.get("approved")),
                    },
                }
            )
        return {"terms": out, "ai_error": err, "ai_available": self.ai is not None}

    async def lesson(self, term_ids: list[str], language: Language) -> dict:
        terms = [self.content.terms_by_id[t] for t in dict.fromkeys(term_ids) if t in self.content.terms_by_id]
        ids = [t.id for t in terms]
        texts, err1 = await self._safely(self.term_texts(ids, language), {})

        lines: list[str] = []
        for t in terms:
            eo, yn = t.check["either_or"], t.check["yes_no"]
            lines += [eo["q"], *eo["options"], yn["q"]]
        if err1 == "ai_busy":
            translations, err2 = {}, None  # don't spend more of the quota in this request
        else:
            translations, err2 = await self._safely(self.translate(lines, language), {})

        words = []
        for t in terms:
            eo, yn = t.check["either_or"], t.check["yes_no"]
            generated = texts.get(t.id)
            words.append(
                {
                    **t.public(),
                    "l1": {
                        "meaning": generated["meaning"] if generated else None,
                        "example_meaning": generated["example_meaning"] if generated else None,
                        "either_or_q": translations.get(eo["q"]),
                        "either_or_options": [translations.get(o) for o in eo["options"]],
                        "yes_no_q": translations.get(yn["q"]),
                        "approved": bool(generated and generated.get("approved")),
                    },
                }
            )
        return {"words": words, "ai_error": err1 or err2, "ai_available": self.ai is not None}

    async def scenario(self, scenario_id: str, language: Language) -> dict | None:
        s = self.content.scenarios_by_id.get(scenario_id)
        if s is None:
            return None

        dialogue = [{"who": d["who"], "text": _fill_language(d["text"], language)} for d in s["dialogue"]]
        phrases = list(s["useful_phrases"])
        questions = s["questions"]

        to_translate = [d["text"] for d in dialogue] + phrases
        for q in questions:
            to_translate.append(q["q"])
            to_translate += q.get("options", [])
        translations, err = await self._safely(self.translate(to_translate, language), {})

        def l1(text: str) -> str | None:
            return translations.get(text)

        terms = [self.content.terms_by_id[t] for t in s["target_terms"] if t in self.content.terms_by_id]
        return {
            "id": s["id"],
            "icon": s.get("icon", "chat"),
            "title": s["title"],
            "goal": s["goal"],
            "staff_label": s["staff_label"],
            "casas": s.get("casas", []),
            "el_civics": s.get("el_civics", ""),
            "terms": [{"id": t.id, "term": t.term, "definition": t.definition} for t in terms],
            "dialogue": [{**d, "l1": l1(d["text"])} for d in dialogue],
            "useful_phrases": [{"text": p, "l1": l1(p)} for p in phrases],
            "questions": [
                {
                    "type": q["type"],
                    "q": q["q"],
                    "q_l1": l1(q["q"]),
                    "options": q.get("options", []),
                    "options_l1": [l1(o) for o in q.get("options", [])],
                    "answer": q["answer"],
                }
                for q in questions
            ],
            "ai_error": err,
            "ai_available": self.ai is not None,
        }
