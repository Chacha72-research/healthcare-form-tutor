"""Saves your Gemini API key into the .env file in the main project folder.

Run it from the main project folder:

    python3 backend/scripts/set_key.py      (Windows: python backend\\scripts\\set_key.py)

It asks for the key with a hidden prompt, so the key never shows on screen,
and creates .env from .env.example if you don't have one yet. Git ignores
.env, so the key stays on your computer.
"""

from __future__ import annotations

import getpass
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV = ROOT / ".env"
EXAMPLE = ROOT / ".env.example"
NAME = "GEMINI_API_KEY"


def main() -> None:
    if not ENV.exists():
        if EXAMPLE.exists():
            shutil.copy(EXAMPLE, ENV)
        else:
            ENV.write_text("", encoding="utf-8")

    key = getpass.getpass("Paste your Gemini API key (it won't show on screen), then press Enter: ").strip()
    key = key.strip("'\"")
    if not key:
        raise SystemExit("No key entered. Nothing changed.")
    if not key.startswith("AIza"):
        print("Heads up: Gemini keys usually start with 'AIza'. Saving it anyway.")

    lines = ENV.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{NAME}="):
            lines[i] = f"{NAME}={key}"
            break
    else:
        lines.append(f"{NAME}={key}")
    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Saved your key to {ENV}")
    print("Restart the Python server so it picks up the key.")


if __name__ == "__main__":
    main()
