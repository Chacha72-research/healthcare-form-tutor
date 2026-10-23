"""Reads a photo of a healthcare form with Claude and explains the terms on it.

Grounding works in three layers:
  1. The whole glossary goes into the system prompt, and Claude is told to
     explain a term only by restating its glossary definition.
  2. Claude must answer through a tool whose term_id field is an enum of
     glossary ids, so it cannot invent a new term to define.
  3. If a teacher has added an approved translation for that term and
     language, the server swaps it in word for word.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass

from .content import Content, Language

log = logging.getLogger(__name__)

MAX_TERMS = 12
TOOL_NAME = "report_form_terms"

SYSTEM_TEMPLATE = """You help adult English learners understand U.S. healthcare forms. Many are beginners who usually depend on family members or clinic staff to read forms for them.

You will get a photo of a form. Your job:
1. Find printed words and labels on the form that match terms in the GLOSSARY below. Count exact words, the listed other forms, abbreviations, and very close variants as matches.
2. For each match, explain the term in the learner's language in ONE short, plain sentence of 20 words or fewer. The sentence must say the same thing as the glossary definition. Do not add facts, numbers, prices, or medical advice that are not in the definition. Use everyday words a beginner knows.
3. List up to 5 other important printed English words on the form that are NOT in the glossary, so the learner can ask a teacher. Do not define them.

Privacy rules:
- Only report PRINTED labels and headings. Never copy names, dates, ID numbers, addresses, signatures, or anything a person wrote or typed into the form.
- If you see personal information, ignore it completely.

If the photo is not a form, or is too blurry, dark, or cut off to read, set readable to false and return empty lists.

Always answer by calling the {tool} tool.

GLOSSARY (id | term | other forms | definition):
{glossary}"""


@dataclass
class ExplainResult:
    readable: bool
    form_summary: str
    terms: list[dict]
    unlisted_terms: list[str]

    def to_dict(self) -> dict:
        return {
            "readable": self.readable,
            "form_summary": self.form_summary,
            "terms": self.terms,
            "unlisted_terms": self.unlisted_terms,
        }


class ExplainError(RuntimeError):
    pass


def build_system_prompt(content: Content) -> str:
    lines = [
        f"{t.id} | {t.term} | {'; '.join(t.aliases) or '-'} | {t.definition}" for t in content.terms
    ]
    return SYSTEM_TEMPLATE.format(tool=TOOL_NAME, glossary="\n".join(lines))


def build_tool(content: Content) -> dict:
    return {
        "name": TOOL_NAME,
        "description": "Report which glossary terms appear on the healthcare form, with a one-sentence explanation of each in the learner's language.",
        "input_schema": {
            "type": "object",
            "properties": {
                "readable": {
                    "type": "boolean",
                    "description": "False if the photo is not a form or cannot be read.",
                },
                "form_summary": {
                    "type": "string",
                    "description": "One short, plain sentence in the learner's language saying what kind of form this is. No personal information.",
                },
                "terms": {
                    "type": "array",
                    "description": "Glossary terms found on the form, in the order they appear.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "term_id": {"type": "string", "enum": [t.id for t in content.terms]},
                            "form_text": {
                                "type": "string",
                                "description": "The printed English label where the term appears, copied exactly. Never personal information.",
                            },
                            "explanation": {
                                "type": "string",
                                "description": "One plain sentence, 20 words or fewer, in the learner's language, restating the glossary definition.",
                            },
                        },
                        "required": ["term_id", "form_text", "explanation"],
                    },
                },
                "unlisted_terms": {
                    "type": "array",
                    "description": "Up to 5 important printed English words on the form that are not in the glossary.",
                    "items": {"type": "string"},
                },
            },
            "required": ["readable", "form_summary", "terms", "unlisted_terms"],
        },
    }


class Explainer:
    def __init__(self, client, model: str, content: Content):
        self.client = client
        self.model = model
        self.content = content
        self.system_prompt = build_system_prompt(content)
        self.tool = build_tool(content)

    async def explain(self, image_bytes: bytes, media_type: str, language: Language) -> ExplainResult:
        user_text = (
            f"The learner's language is {language.english_name} ({language.native_name}). "
            f"Write form_summary and every explanation in {language.english_name}. "
            "Keep each explanation to one plain sentence."
        )
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                system=[
                    {
                        "type": "text",
                        "text": self.system_prompt,
                        # The glossary prompt is identical on every request, so cache it.
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=[self.tool],
                tool_choice={"type": "tool", "name": TOOL_NAME},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": base64.standard_b64encode(image_bytes).decode("ascii"),
                                },
                            },
                            {"type": "text", "text": user_text},
                        ],
                    }
                ],
            )
        except Exception as exc:  # anthropic.APIError and network errors
            log.exception("Claude request failed")
            raise ExplainError("The form reader is not available right now.") from exc

        tool_input = next(
            (block.input for block in response.content if getattr(block, "type", None) == "tool_use"),
            None,
        )
        if not isinstance(tool_input, dict):
            raise ExplainError("The form reader returned an unexpected answer.")

        return self.ground(tool_input, language)

    def ground(self, raw: dict, language: Language) -> ExplainResult:
        """Keep only glossary terms and attach the vetted English definition."""
        terms: list[dict] = []
        seen: set[str] = set()
        for item in raw.get("terms") or []:
            if not isinstance(item, dict):
                continue
            term = self.content.terms_by_id.get(str(item.get("term_id", "")))
            if term is None or term.id in seen:
                continue
            seen.add(term.id)

            vetted_translation = term.translations.get(language.code)
            if vetted_translation:
                explanation, source = vetted_translation, "vetted"
            else:
                explanation, source = str(item.get("explanation", "")).strip(), "ai"
            if not explanation:
                continue

            terms.append(
                {
                    **term.public(),
                    "form_text": str(item.get("form_text", "")).strip()[:120],
                    "explanation": explanation,
                    "explanation_source": source,
                }
            )
            if len(terms) == MAX_TERMS:
                break

        unlisted = [str(w).strip()[:60] for w in (raw.get("unlisted_terms") or []) if str(w).strip()][:5]
        return ExplainResult(
            readable=bool(raw.get("readable", True)),
            form_summary=str(raw.get("form_summary", "")).strip(),
            terms=terms,
            unlisted_terms=unlisted,
        )
