"""The demo warm-up must prepare exactly what the app plays."""

import asyncio
import importlib.util
from pathlib import Path

from app.content import load_content
from app.lessons import GeneratedStore, LessonService
from app.speech import pcm_to_wav
from tests.fakes import FakeAI

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "warm_demo.py"
spec = importlib.util.spec_from_file_location("warm_demo", SCRIPT)
warm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(warm)

content = load_content()


class SavingVoice:
    def __init__(self):
        self.saved: set[tuple] = set()
        self.calls = 0

    def is_saved(self, text, voice="tutor", style="tutor"):
        return (text, voice, style) in self.saved

    async def speak(self, text, voice="tutor", style="tutor"):
        self.calls += 1
        self.saved.add((text, voice, style))
        return pcm_to_wav(b"\x00\x00" * 24000)  # 1 second


def test_form_clips_are_meaning_and_tip_in_the_tutor_voice(tmp_path):
    service = LessonService(content, GeneratedStore(tmp_path), FakeAI())
    terms = asyncio.run(service.explain(["copay", "deductible"], content.language("ta")))["terms"]
    clips = warm.form_clips(terms)
    assert clips == [
        ("MEANING copay", "tutor", "tutor"),
        ("TIP copay", "tutor", "tutor"),
        ("MEANING deductible", "tutor", "tutor"),
        ("TIP deductible", "tutor", "tutor"),
    ]


def test_make_all_skips_saved_clips():
    voice = SavingVoice()
    clips = [("a", "tutor", "tutor"), ("b", "tutor", "tutor"), ("a", "tutor", "tutor")]
    made, failed, seconds = asyncio.run(warm.make_all(voice, clips, "test"))
    assert (made, failed, round(seconds)) == (2, 0, 2)
    made, _, _ = asyncio.run(warm.make_all(voice, clips, "test"))
    assert made == 0 and voice.calls == 2


def test_clip_lines_are_all_real_ui_strings():
    ui = {**content.english_ui, **content.language("ta").ui}
    clips = warm.clip_line_clips(ui)
    assert len(clips) == len(warm.CLIP_LINES)
    assert all(voice == "tutor" and text for text, voice, _ in clips)
