"""Checks the exact requests sent to Gemini and Claude, using fake clients."""

import asyncio
import base64
import json
from types import SimpleNamespace

import pytest

from app.ai import AIBusy, ClaudeAI, FilePart, GeminiAI
from app.speech import GeminiVoice


class FakeInteractions:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.result


def gemini_client(interactions):
    return SimpleNamespace(aio=SimpleNamespace(interactions=interactions))


def test_gemini_json_request_shape():
    inter = FakeInteractions(SimpleNamespace(output_text=json.dumps({"ok": True})))
    ai = GeminiAI("k", "gemini-test", client=gemini_client(inter))
    out = asyncio.run(
        ai.generate_json(system="sys", prompt="hi", schema={"type": "object"}, files=[FilePart(b"%PDF", "application/pdf")])
    )
    assert out == {"ok": True}
    kw = inter.kwargs
    assert kw["model"] == "gemini-test" and kw["system_instruction"] == "sys" and kw["store"] is False
    assert kw["input"][0] == {"type": "document", "data": base64.b64encode(b"%PDF").decode(), "mime_type": "application/pdf"}
    assert kw["input"][1] == {"type": "text", "text": "hi"}
    assert kw["response_format"]["mime_type"] == "application/json"


def test_gemini_rate_limit_becomes_busy():
    err = RuntimeError("429 RESOURCE_EXHAUSTED: quota")
    ai = GeminiAI("k", "m", client=gemini_client(FakeInteractions(error=err)))
    with pytest.raises(AIBusy):
        asyncio.run(ai.generate_json(system="s", prompt="p", schema={}))


def test_claude_uses_forced_tool_and_document_block():
    class Messages:
        kwargs = None

        async def create(self, **kwargs):
            Messages.kwargs = kwargs
            return SimpleNamespace(content=[SimpleNamespace(type="tool_use", input={"readable": True})])

    ai = ClaudeAI("k", "claude-test", client=SimpleNamespace(messages=Messages()))
    out = asyncio.run(
        ai.generate_json(system="s", prompt="p", schema={"type": "object"}, files=[FilePart(b"img", "image/png")])
    )
    assert out == {"readable": True}
    assert Messages.kwargs["tool_choice"] == {"type": "tool", "name": "respond"}
    assert Messages.kwargs["messages"][0]["content"][0]["type"] == "image"


def test_voice_wraps_pcm_and_caches(tmp_path):
    pcm = b"\x00\x01" * 100
    inter = FakeInteractions(SimpleNamespace(output_audio=SimpleNamespace(data=base64.b64encode(pcm).decode())))
    voice = GeminiVoice("k", "tts-test", {"tutor": "Sulafat"}, tmp_path, client=gemini_client(inter))

    audio = asyncio.run(voice.speak("வணக்கம்", "tutor", "tutor"))
    assert audio.startswith(b"RIFF")
    kw = inter.kwargs
    assert kw["generation_config"] == {"speech_config": [{"voice": "Sulafat"}]}
    assert kw["input"][0]["content"][0]["annotations"][0]["type"] == "speech_metadata"

    inter.kwargs = None
    again = asyncio.run(voice.speak("வணக்கம்", "tutor", "tutor"))
    assert again == audio and inter.kwargs is None  # served from the cache
