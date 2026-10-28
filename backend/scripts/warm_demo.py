"""Prepare a demo ahead of time, so nothing waits on the AI during it.

Run it from the backend folder (with .venv active):

    python scripts/warm_demo.py              # Tamil, using the sample form
    python scripts/warm_demo.py --lang es    # another language

It writes the learner-language text for every word on the sample form and the
pretend insurance card (what it means, an example, what to write, and the
check questions), records the "Listen" audio for each of those and for Clip's
instructions, and translates all six speaking-practice conversations.
Everything is saved, so the demo and every test run after it load instantly
and cost nothing. At the end it prints roughly what this run cost.

English audio in the app uses Chrome's built-in voice, so it needs no warm-up.
The clips below must match what the app plays: word meanings and tips
(frontend/src/components/WordCard.tsx and screens/Lesson.tsx) and Clip's lines
(frontend/src/components/Clip.tsx).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.ai import AIError, make_provider  # noqa: E402
from app.concepts import concept_lesson, load_concepts  # noqa: E402
from app.config import settings  # noqa: E402
from app.content import get_content  # noqa: E402
from app.forms import TermMatcher  # noqa: E402
from app.lessons import GeneratedStore, LessonService  # noqa: E402
from app.samples import load_samples  # noqa: E402
from app.speech import GeminiVoice, audio_cost, wav_seconds  # noqa: E402

# (text, voice role, style) for one clip
Clip = tuple[str, str, str]

# The key words of the 5 lessons. Keep in sync with LESSONS in frontend/src/path.ts.
LESSON_WORDS = [
    "member_id", "group_number", "copay", "premium",
    "policyholder", "relationship_to_patient", "not_applicable", "interpreter",
    "explanation_of_benefits", "claim", "deductible", "coinsurance",
    "balance_due", "date_of_service", "payment_plan", "guarantor",
    "primary_care_provider", "urgent_care", "emergency_room", "in_network",
]

# Clip's instructions, which have a "Listen" button. Keep in sync with the app.
CLIP_LINES = [
    "clip_hello", "clip_pick_form", "clip_tap_word", "clip_tap_card", "clip_meet", "clip_say", "clip_listen",
    "clip_find", "clip_find_card", "clip_check", "clip_tip", "clip_fill", "clip_quiz", "clip_talk", "clip_story", "clip_bigpicture",
]


def clip_line_clips(ui: dict[str, str]) -> list[Clip]:
    return [(ui[k], "tutor", "tutor") for k in CLIP_LINES if ui.get(k)]


def form_clips(terms: list[dict]) -> list[Clip]:
    """The learner-language audio the form screen can play: each word's meaning and tip."""
    clips: list[Clip] = []
    for t in terms:
        for text in (t["l1"]["meaning"], t["l1"]["tip"]):
            if text:
                clips.append((text, "tutor", "tutor"))
    return clips


async def make_all(voice, clips: list[Clip], label: str) -> tuple[int, int, float]:
    unique = list(dict.fromkeys(c for c in clips if c[0].strip()))
    todo = [c for c in unique if not voice.is_saved(*c)]
    print(f"  {label}: {len(unique)} clips, {len(unique) - len(todo)} already saved, making {len(todo)}")
    made, failed, seconds = 0, 0, 0.0
    gate = asyncio.Semaphore(3)

    async def one(clip: Clip) -> None:
        nonlocal made, failed, seconds
        async with gate:
            for attempt in range(3):
                try:
                    audio = await voice.speak(*clip)
                    made += 1
                    seconds += wav_seconds(audio)
                    return
                except AIError:
                    await asyncio.sleep(10 * (attempt + 1))  # wait out a rate limit, then retry
            failed += 1

    await asyncio.gather(*(one(c) for c in todo))
    return made, failed, seconds


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", default="ta")
    parser.add_argument("--no-voice", action="store_true", help="Only prepare text, no audio")
    args = parser.parse_args()

    content = get_content()
    lang = content.language(args.lang)
    if lang is None:
        raise SystemExit(f"Unknown language '{args.lang}'. Choose from: {', '.join(c.code for c in content.languages)}")
    if not settings.gemini_api_key:
        raise SystemExit("Add your Gemini key first: python3 backend/scripts/set_key.py")

    lessons = LessonService(content, GeneratedStore(settings.generated_dir), make_provider(settings))
    voice = GeminiVoice(
        settings.gemini_api_key,
        settings.gemini_tts_model,
        {"tutor": settings.tutor_voice, "staff": settings.staff_voice, "learner": settings.learner_voice},
        settings.audio_cache_dir,
    )
    start = time.monotonic()

    papers = load_samples(content, TermMatcher(content.terms))
    ids = list(dict.fromkeys([*LESSON_WORDS, *(t["id"] for p in papers for t in (p.get("terms") or p["reading"]["terms"]))]))
    print(f"Preparing {lang.english_name}: {len(ids)} words on {len(papers)} practice papers and {len(content.scenarios)} conversations.")

    data = await lessons.explain(ids, lang)
    if data["ai_error"]:
        print(f"  The AI was busy ({data['ai_error']}). Wait a minute and run this again.")
    checks = await lessons.lesson(ids, lang)
    print("  Check questions:", "busy, run again later" if checks["ai_error"] else "ready")

    story_clips: list[Clip] = []
    for c in load_concepts():
        story = await concept_lesson(lessons, c["id"], lang)
        print(f"  Story '{c['title']['en']}':", "busy, run again later" if story["ai_error"] else "ready")
        story_clips += [(card["explain_l1"], "tutor", "tutor") for card in story["cards"] if card["explain_l1"]]

    made, failed, seconds = 0, 0, 0.0
    if not args.no_voice:
        clips = form_clips(data["terms"]) + clip_line_clips({**content.english_ui, **lang.ui}) + story_clips
        made, failed, seconds = await make_all(voice, clips, "Voice clips")

    for sc in content.scenarios:
        result = await lessons.scenario(sc["id"], lang)
        status = "busy, run again later" if result["ai_error"] else "ready"
        print(f"  {sc['title']['en']}: {status}")

    cost = audio_cost(seconds, settings.gemini_tts_model)
    print()
    print(f"Done in {time.monotonic() - start:.0f} s. Made {made} new voice clips ({seconds / 60:.1f} min of audio).")
    if cost is not None:
        print(f"Voice cost for this run: about ${cost:.2f}. The text costs a fraction of a cent.")
    if failed:
        print(f"{failed} clips didn't finish. Run the same command again to fill them in.")
    else:
        print("Everything is saved. The demo will load instantly and for free.")


if __name__ == "__main__":
    asyncio.run(main())
