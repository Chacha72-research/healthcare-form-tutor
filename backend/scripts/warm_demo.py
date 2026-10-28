"""Prepare a demo ahead of time, so nothing waits on the AI during it.

Run it from the backend folder (with .venv active):

    python scripts/warm_demo.py              # Tamil, using the sample form
    python scripts/warm_demo.py --lang es    # another language

It writes the learner-language text for every word on the sample form (what
it means, an example, and what to write), records the "Listen" audio for
each of those, and translates all six speaking-practice conversations.
Everything is saved, so the demo and every test run after it load instantly
and cost nothing. At the end it prints roughly what this run cost.

English audio in the app uses Chrome's built-in voice, so it needs no warm-up.
The clips below must match what the form screen plays (frontend/src/screens/Form.tsx).
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
from app.config import REPO_ROOT, settings  # noqa: E402
from app.content import get_content  # noqa: E402
from app.forms import TermMatcher, analyze, extract_pdf_lines  # noqa: E402
from app.lessons import GeneratedStore, LessonService  # noqa: E402
from app.speech import GeminiVoice, audio_cost, wav_seconds  # noqa: E402

SAMPLE = REPO_ROOT / "frontend" / "public" / "sample-form.pdf"

# (text, voice role, style) for one clip
Clip = tuple[str, str, str]


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

    reading = analyze(extract_pdf_lines(SAMPLE.read_bytes()), TermMatcher(content.terms), content, "text")
    ids = [x["id"] for x in reading.terms]
    print(f"Preparing {lang.english_name}: {len(ids)} words on the sample form and {len(content.scenarios)} conversations.")

    data = await lessons.explain(ids, lang)
    if data["ai_error"]:
        print(f"  The AI was busy ({data['ai_error']}). Wait a minute and run this again.")
    made, failed, seconds = 0, 0, 0.0
    if not args.no_voice:
        made, failed, seconds = await make_all(voice, form_clips(data["terms"]), "Form words")

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
