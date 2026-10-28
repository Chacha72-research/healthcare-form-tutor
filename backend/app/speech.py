"""Text-to-speech with Gemini's free TTS models, cached on disk.

Lesson lines repeat a lot (the same tutor sentences, the same words), so each
unique line is generated once and then served from backend/data/audio_cache.
That keeps the app fast and inside the free tier's limits.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import wave
from pathlib import Path

from .ai import COOLDOWN, AIBusy, AIError, _wrap, bounded, gemini_client

log = logging.getLogger(__name__)

SAMPLE_RATE = 24000

STYLES = {
    # The tutor explaining in the learner's language.
    "tutor": "warm, casual, and patient, like a friendly tutor talking to an adult learner; speak slowly and clearly",
    # English model lines and pronunciation: slow and clear for beginners.
    "model": "clear, calm, and slow, like a teacher saying English for a beginner to repeat",
}


# Paid prices per 1M audio tokens (Gemini charges 25 audio tokens per second).
# From https://ai.google.dev/gemini-api/docs/pricing, through Dec 31, 2026.
AUDIO_PRICE_PER_M = {"gemini-3.8-flash-tts": 9.00, "gemini-3.8-flash-lite-tts": 6.00}
AUDIO_TOKENS_PER_SECOND = 25


def wav_seconds(wav: bytes) -> float:
    try:
        with wave.open(io.BytesIO(wav)) as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, EOFError):
        return 0.0


def audio_cost(seconds: float, model: str) -> float | None:
    price = AUDIO_PRICE_PER_M.get(model)
    if price is None:
        return None
    return seconds * AUDIO_TOKENS_PER_SECOND * price / 1_000_000


def pcm_to_wav(pcm: bytes, rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


class GeminiVoice:
    timeout = 20  # seconds for one line; the app falls back to the device's voice after that

    def __init__(self, api_key: str, model: str, voices: dict[str, str], cache_dir: Path, client=None):
        self.client = client or gemini_client(api_key)
        self.model = model
        self.voices = voices
        self.cache_dir = cache_dir
        self._locks: dict[str, asyncio.Lock] = {}
        # Running totals since the server started, printed after each new line.
        self.made_lines = 0
        self.made_seconds = 0.0

    def _key(self, text: str, voice: str, style: str) -> str:
        raw = f"{self.model}|{voice}|{style}|{text}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:40]

    def _path(self, text: str, voice: str, style: str) -> Path:
        voice_name = self.voices.get(voice, self.voices["tutor"])
        return self.cache_dir / f"{self._key(text, voice_name, style)}.wav"

    def is_saved(self, text: str, voice: str = "tutor", style: str = "tutor") -> bool:
        return self._path(text, voice, style).exists()

    async def speak(self, text: str, voice: str = "tutor", style: str = "tutor") -> bytes:
        voice_name = self.voices.get(voice, self.voices["tutor"])
        style_text = STYLES.get(style, STYLES["tutor"])
        key = self._key(text, voice_name, style)
        path = self.cache_dir / f"{key}.wav"
        if path.exists():
            return path.read_bytes()

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            if path.exists():
                return path.read_bytes()
            audio = await self._synthesize(text, voice_name, style_text)
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            path.write_bytes(audio)
        self._locks.pop(key, None)
        self._log_usage(audio)
        return audio

    def _log_usage(self, audio: bytes) -> None:
        seconds = wav_seconds(audio)
        self.made_lines += 1
        self.made_seconds += seconds
        cost = audio_cost(self.made_seconds, self.model)
        money = f", about ${cost:.2f} so far" if cost is not None else ""
        log.info(
            "Made a new voice line (%.1f s). Since the server started: %d lines, %.1f min of audio%s. "
            "Saved lines replay for free.",
            seconds,
            self.made_lines,
            self.made_seconds / 60,
            money,
        )

    async def _synthesize(self, text: str, voice_name: str, style_text: str) -> bytes:
        COOLDOWN.check(self.model)
        try:
            interaction = await bounded(
                self.client.aio.interactions.create(
                    model=self.model,
                    input=[
                        {
                            "type": "user_input",
                            "content": [
                                {
                                    "type": "text",
                                    "text": text,
                                    "annotations": [{"type": "speech_metadata", "style": style_text}],
                                }
                            ],
                        }
                    ],
                    response_format={"type": "audio"},
                    generation_config={"speech_config": [{"voice": voice_name}]},
                    store=False,
                ),
                self.timeout,
            )
        except AIBusy:
            raise
        except Exception as exc:
            log.warning("Gemini TTS failed: %s", exc)
            err = _wrap(exc)
            if isinstance(err, AIBusy):
                COOLDOWN.trip(self.model)
            raise err from exc

        audio = getattr(interaction, "output_audio", None)
        data = getattr(audio, "data", None)
        if not data:
            raise AIError("No audio came back.")
        if isinstance(data, str):
            data = base64.b64decode(data)
        if not data.startswith(b"RIFF"):
            data = pcm_to_wav(data)
        return data
