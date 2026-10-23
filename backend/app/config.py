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
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    claude_model: str = field(default_factory=lambda: _env("CLAUDE_MODEL", "claude-sonnet-5-5"))

    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    gemini_live_model: str = field(default_factory=lambda: _env("GEMINI_LIVE_MODEL", "gemini-3.8-live"))
    gemini_voice: str = field(default_factory=lambda: _env("GEMINI_VOICE"))

    tts_provider: str = field(default_factory=lambda: _env("TTS_PROVIDER", "browser").lower())
    google_tts_api_key: str = field(default_factory=lambda: _env("GOOGLE_TTS_API_KEY"))

    allowed_origins: list[str] = field(
        default_factory=lambda: [
            o.strip() for o in _env("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        ]
    )
    max_upload_mb: int = field(default_factory=lambda: int(_env("MAX_UPLOAD_MB", "8") or 8))
    results_path: Path = field(
        default_factory=lambda: Path(_env("RESULTS_PATH") or DATA_DIR / "results" / "quiz_results.jsonl")
    )

    @property
    def scan_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def conversation_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def server_tts_enabled(self) -> bool:
        return self.tts_provider == "google" and bool(self.google_tts_api_key)


settings = Settings()
