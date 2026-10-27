"""Settings read from environment variables (and the repo-root .env file)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"

# Load .env from the repo root first, then backend/ if someone put it there.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass
class Settings:
    # One free Gemini key powers everything: reading pictures, lesson
    # translations, the tutor's voice, and live conversation practice.
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-3.8-flash"))
    gemini_tts_model: str = field(default_factory=lambda: _env("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts"))
    gemini_live_model: str = field(default_factory=lambda: _env("GEMINI_LIVE_MODEL", "gemini-3.8-live"))
    tutor_voice: str = field(default_factory=lambda: _env("TUTOR_VOICE", "Sulafat"))
    staff_voice: str = field(default_factory=lambda: _env("STAFF_VOICE", "Achird"))
    learner_voice: str = field(default_factory=lambda: _env("LEARNER_VOICE", "Puck"))

    # Optional: use Claude instead of Gemini for reading forms and writing
    # lesson text. This costs money; voice and live practice still use Gemini.
    ai_provider: str = field(default_factory=lambda: _env("AI_PROVIDER", "gemini").lower())
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    claude_model: str = field(default_factory=lambda: _env("CLAUDE_MODEL", "claude-sonnet-5-5"))

    allowed_origins: list[str] = field(
        default_factory=lambda: [
            o.strip() for o in _env("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        ]
    )
    max_upload_mb: int = field(default_factory=lambda: int(_env("MAX_UPLOAD_MB", "10") or 10))
    results_path: Path = field(
        default_factory=lambda: Path(_env("RESULTS_PATH") or DATA_DIR / "results" / "quiz_results.jsonl")
    )
    generated_dir: Path = field(default_factory=lambda: Path(_env("GENERATED_DIR") or DATA_DIR / "generated"))
    audio_cache_dir: Path = field(default_factory=lambda: Path(_env("AUDIO_CACHE_DIR") or DATA_DIR / "audio_cache"))

    @property
    def voice_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def live_enabled(self) -> bool:
        return bool(self.gemini_api_key)


settings = Settings()
