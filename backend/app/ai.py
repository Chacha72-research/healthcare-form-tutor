"""Small wrapper around the AI models the app uses.

The app only asks AI for two narrow jobs:
  1. Read the printed labels off a picture of a form (when there is no text layer).
  2. Write the learner's-language parts of a lesson: a casual spoken meaning
     for each word and translations of short English lines.

Everything else (which words are on the form, the lesson steps, the quiz,
the model conversations) is fixed teaching content from backend/data.

Gemini is the default because its free tier covers all of this. Claude can be
used instead for the text jobs by setting AI_PROVIDER=claude.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from dataclasses import dataclass
from typing import Protocol, Sequence

log = logging.getLogger(__name__)


class AIError(RuntimeError):
    code = "ai_failed"


class AIBusy(AIError):
    """Rate limit or quota reached (common on free tiers)."""

    code = "ai_busy"


@dataclass(frozen=True)
class FilePart:
    data: bytes
    mime_type: str


class AIProvider(Protocol):
    name: str

    async def generate_json(
        self, *, system: str, prompt: str, schema: dict, files: Sequence[FilePart] = ()
    ) -> dict: ...


def _is_rate_limit(exc: Exception) -> bool:
    for attr in ("code", "status_code", "status"):
        if getattr(exc, attr, None) in (429, "429", "RESOURCE_EXHAUSTED"):
            return True
    text = str(exc)
    return "429" in text or "RESOURCE_EXHAUSTED" in text or "rate limit" in text.lower()


def _wrap(exc: Exception) -> AIError:
    if _is_rate_limit(exc):
        return AIBusy("The AI service is busy. Try again in a minute.")
    return AIError("The AI service did not answer.")


class Cooldown:
    """After a rate-limit error, stop calling that model for a minute instead of hammering it.

    Free-tier quotas are small, and every rejected call still counts against
    the project, so once Gemini says "slow down" the app answers "busy"
    right away and the lesson carries on in English until the minute is up.
    """

    def __init__(self, seconds: float = 60):
        self.seconds = seconds
        self._until: dict[str, float] = {}

    def check(self, model: str) -> None:
        if time.monotonic() < self._until.get(model, 0):
            raise AIBusy("The AI service is cooling down after a rate limit.")

    def trip(self, model: str) -> None:
        self._until[model] = time.monotonic() + self.seconds

    def reset(self) -> None:
        self._until.clear()


COOLDOWN = Cooldown()


def _b64(data: bytes) -> str:
    return base64.standard_b64encode(data).decode("ascii")


def gemini_client(api_key: str):
    """A Gemini client that retries once, quickly, instead of for up to 30 seconds.

    The app has its own fallbacks (English text, the device's voice), so a
    fast "busy" answer is much better for learners than a long silent wait.
    """
    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
    )


async def bounded(coro, seconds: float):
    """Wait at most `seconds` for an AI call, then give up and report busy."""
    try:
        return await asyncio.wait_for(coro, timeout=seconds)
    except asyncio.TimeoutError as exc:
        raise AIBusy("The AI service took too long.") from exc


class GeminiAI:
    name = "gemini"
    timeout = 45  # seconds; writing a batch of lesson text can take a while

    def __init__(self, api_key: str, model: str, client=None):
        self.client = client or gemini_client(api_key)
        self.model = model

    async def generate_json(
        self, *, system: str, prompt: str, schema: dict, files: Sequence[FilePart] = ()
    ) -> dict:
        parts: list[dict] = []
        for f in files:
            kind = "document" if f.mime_type == "application/pdf" else "image"
            parts.append({"type": kind, "data": _b64(f.data), "mime_type": f.mime_type})
        parts.append({"type": "text", "text": prompt})
        COOLDOWN.check(self.model)
        try:
            interaction = await bounded(
                self.client.aio.interactions.create(
                    model=self.model,
                    system_instruction=system,
                    input=parts,
                    response_format={"type": "text", "mime_type": "application/json", "schema": schema},
                    store=False,  # don't keep learners' forms on Google's side
                ),
                self.timeout,
            )
        except AIBusy:
            raise
        except Exception as exc:
            log.warning("Gemini request failed: %s", exc)
            err = _wrap(exc)
            if isinstance(err, AIBusy):
                COOLDOWN.trip(self.model)
            raise err from exc
        try:
            return json.loads(interaction.output_text or "")
        except (TypeError, json.JSONDecodeError) as exc:
            raise AIError("The AI answer was not valid JSON.") from exc


class ClaudeAI:
    name = "claude"

    def __init__(self, api_key: str, model: str, client=None):
        if client is None:
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=api_key)
        self.client = client
        self.model = model

    async def generate_json(
        self, *, system: str, prompt: str, schema: dict, files: Sequence[FilePart] = ()
    ) -> dict:
        content: list[dict] = []
        for f in files:
            kind = "document" if f.mime_type == "application/pdf" else "image"
            content.append(
                {"type": kind, "source": {"type": "base64", "media_type": f.mime_type, "data": _b64(f.data)}}
            )
        content.append({"type": "text", "text": prompt})
        tool = {"name": "respond", "description": "Return the answer.", "input_schema": schema}
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                system=system,
                tools=[tool],
                tool_choice={"type": "tool", "name": "respond"},
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:
            log.warning("Claude request failed: %s", exc)
            if type(exc).__name__ == "RateLimitError":
                raise AIBusy("The AI service is busy. Try again in a minute.") from exc
            raise _wrap(exc) from exc
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and isinstance(block.input, dict):
                return block.input
        raise AIError("The AI answer was missing.")


def make_provider(settings) -> AIProvider | None:
    if settings.ai_provider == "claude" and settings.anthropic_api_key:
        return ClaudeAI(settings.anthropic_api_key, settings.claude_model)
    if settings.gemini_api_key:
        return GeminiAI(settings.gemini_api_key, settings.gemini_model)
    return None
