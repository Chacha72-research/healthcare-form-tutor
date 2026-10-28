"""The demo warm-up must ask for exactly the clips the app plays."""

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


def test_lesson_and_situation_clips(tmp_path):
    lang = content.language("ta")
    t = warm.ui(content, lang)
    service = LessonService(content, GeneratedStore(tmp_path), FakeAI())
    words = asyncio.run(service.lesson(["copay", "deductible"], lang))["words"]
    clips = warm.lesson_clips(words, t, {"copay"})

    assert (lang.ui["tutor_hello"], "tutor", "tutor") in clips
    assert ("MEANING copay", "tutor", "tutor") in clips
    assert ("Copay", "tutor", "model") in clips  # English said slowly for repeating
    assert (t("tutor_find"), "tutor", "tutor") in clips  # copay is on the form
    assert sum(1 for c in clips if c == (t("tutor_find"), "tutor", "tutor")) == 1  # deductible is not
    assert (t("tutor_done", n=2), "tutor", "tutor") in clips

    situation = asyncio.run(service.scenario("make_appointment", lang))
    sclips = warm.scenario_clips(situation)
    assert ("Tamil, please.", "learner", "model") in sclips
    assert ("Hello, Valley Health Clinic. How can I help you?", "staff", "model") in sclips


def test_make_all_skips_saved_clips():
    voice = SavingVoice()
    clips = [("a", "tutor", "tutor"), ("b", "staff", "model"), ("a", "tutor", "tutor")]
    made, failed, seconds = asyncio.run(warm.make_all(voice, clips, "test"))
    assert (made, failed, round(seconds)) == (2, 0, 2)
    made, _, _ = asyncio.run(warm.make_all(voice, clips, "test"))
    assert made == 0 and voice.calls == 2
