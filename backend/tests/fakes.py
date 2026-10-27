"""Fake AI pieces so tests never call a real API."""

from __future__ import annotations

from app.ai import AIBusy


class FakeAI:
    """Answers lesson and translation requests with predictable text."""

    name = "fake"

    def __init__(self, labels: list[str] | None = None, busy: bool = False):
        self.calls: list[dict] = []
        self.labels = labels or []
        self.busy = busy

    async def generate_json(self, *, system, prompt, schema, files=()):
        self.calls.append({"system": system, "prompt": prompt, "schema": schema, "files": list(files)})
        if self.busy:
            raise AIBusy("busy")
        props = schema["properties"]
        if "labels" in props:
            return {"readable": bool(self.labels), "labels": self.labels}
        rows = [line.split(" | ", 1) for line in prompt.splitlines() if " | " in line]
        item_props = props["items"]["items"]["properties"]
        if "term_id" in item_props:
            ids = [r[0] for r in rows if r[0] != "id"]
            return {"items": [{"term_id": i, "meaning": f"MEANING {i}", "example_meaning": f"EXAMPLE {i}"} for i in ids]}
        items = []
        for idx, text in rows:
            if idx.isdigit():
                items.append({"id": int(idx), "text": f"[L1] {text}"})
        return {"items": items}


class FakeVoice:
    def __init__(self):
        self.calls: list[tuple[str, str, str]] = []

    async def speak(self, text, voice="tutor", style="tutor"):
        self.calls.append((text, voice, style))
        return b"RIFF....WAVEfake"
