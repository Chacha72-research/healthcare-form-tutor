"""Prepare a demo ahead of time: make every lesson line and voice clip once.

Run it from the backend folder (with .venv active) while the server is
stopped or running, it doesn't matter:

    python scripts/warm_demo.py                 # Tamil, sample form lesson 1, all 6 situations
    python scripts/warm_demo.py --lessons 5     # every lesson on the sample form
    python scripts/warm_demo.py --lang es       # another language

Everything it makes is saved (backend/data/generated and audio_cache), so the
demo and every test run after it replay instantly and cost nothing. Only the
live Talk step uses the API during the demo. At the end it prints how much
audio it made and roughly what that cost.

The lines below must match what the app says (frontend/src/screens/Lesson.tsx
and Scenario.tsx), so the saved clips are the ones the app asks for.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.ai import AIError, make_provider  # noqa: E402
from app.config import REPO_ROOT, settings  # noqa: E402
from app.content import Content, Language, get_content  # noqa: E402
from app.forms import TermMatcher, extract_pdf_lines, analyze  # noqa: E402
from app.lessons import GeneratedStore, LessonService  # noqa: E402
from app.speech import GeminiVoice, audio_cost, wav_seconds  # noqa: E402

SAMPLE = REPO_ROOT / "frontend" / "public" / "sample-form.pdf"
WORDS_PER_LESSON = 6  # same as WORDS_PER_LESSON in frontend/src/App.tsx

# (text, voice role, style) for one clip
Clip = tuple[str, str, str]


def ui(content: Content, lang: Language):
    strings = {**content.english_ui, **lang.ui}

    def t(key: str, **vars) -> str:
        return re.sub(r"\{(\w+)\}", lambda m: str(vars.get(m.group(1), m.group(0))), strings.get(key, key))

    return t


def l1(text: str) -> Clip:
    return (text, "tutor", "tutor")


def en(text: str) -> Clip:
    return (text, "tutor", "model")


def lesson_clips(words: list[dict], t, form_ids: set[str]) -> list[Clip]:
    """Everything the tutor says in one lesson, as in Lesson.tsx."""
    clips = [l1(t("tutor_hello")), l1(t("tutor_goal", n=len(words))), l1(t("tutor_right"))]
    for i, w in enumerate(words):
        eo, yn, wl1 = w["check"]["either_or"], w["check"]["yes_no"], w["l1"]
        clips.append(l1(t("tutor_word", word=w["term"])))
        if w["id"] in form_ids:
            clips.append(l1(t("tutor_find")))
        if wl1["meaning"]:
            clips.append(l1(wl1["meaning"]))
        else:
            clips += [l1(t("tutor_no_meaning")), en(w["definition"])]
        clips += [l1(t("tutor_say", say=w["term"])), en(w["term"]), l1(t("tutor_your_turn"))]
        clips += [l1(t("tutor_example")), en(w["example"])]
        clips += [l1(t("tutor_check")), en(eo["q"]), en(yn["q"])]
        # Feedback for a wrong answer names the right one.
        answer_l1 = wl1["either_or_options"][eo["options"].index(eo["answer"])] or eo["answer"]
        clips.append(l1(t("tutor_wrong", answer=answer_l1)))
        clips.append(l1(t("tutor_wrong", answer=t("yes" if yn["answer"] else "no"))))
        last = i == len(words) - 1
        clips.append(l1(t("tutor_done", n=len(words)) if last else t("tutor_next")))
    return clips


def scenario_clips(data: dict) -> list[Clip]:
    """Everything the Listen and Check steps can play, as in Scenario.tsx."""
    clips: list[Clip] = [en(x["term"]) for x in data["terms"]]
    clips += [(d["text"], "staff" if d["who"] == "staff" else "learner", "model") for d in data["dialogue"]]
    clips += [(p["text"], "learner", "model") for p in data["useful_phrases"]]
    clips += [en(q["q"]) for q in data["questions"]]
    return clips


async def make_all(voice: GeminiVoice, clips: list[Clip], label: str) -> tuple[int, int, float]:
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
    parser.add_argument("--lessons", type=int, default=1, help="How many lessons of the sample form to prepare")
    parser.add_argument("--no-voice", action="store_true", help="Only prepare text, no audio")
    args = parser.parse_args()

    content = get_content()
    lang = content.language(args.lang)
    if lang is None:
        raise SystemExit(f"Unknown language '{args.lang}'. Choose from: {', '.join(c.code for c in content.languages)}")
    if not settings.gemini_api_key:
        raise SystemExit("Add your Gemini key first: python3 backend/scripts/set_key.py")

    ai = make_provider(settings)
    lessons = LessonService(content, GeneratedStore(settings.generated_dir), ai)
    voice = GeminiVoice(
        settings.gemini_api_key,
        settings.gemini_tts_model,
        {"tutor": settings.tutor_voice, "staff": settings.staff_voice, "learner": settings.learner_voice},
        settings.audio_cache_dir,
    )
    t = ui(content, lang)
    start = time.monotonic()

    reading = analyze(extract_pdf_lines(SAMPLE.read_bytes()), TermMatcher(content.terms), content, "text")
    form_ids = {x["id"] for x in reading.terms}
    total_lessons = -(-len(reading.terms) // WORDS_PER_LESSON)
    n = max(1, min(args.lessons, total_lessons))
    print(f"Preparing {lang.english_name}: {n} of {total_lessons} sample-form lessons and {len(content.scenarios)} situations.")

    made = failed = 0
    seconds = 0.0
    for i in range(n):
        ids = [x["id"] for x in reading.terms[i * WORDS_PER_LESSON : (i + 1) * WORDS_PER_LESSON]]
        data = await lessons.lesson(ids, lang)
        if data["ai_error"]:
            print(f"  Lesson {i + 1}: the AI was busy ({data['ai_error']}). Run this again in a minute.")
            continue
        if not args.no_voice:
            m, f, s = await make_all(voice, lesson_clips(data["words"], t, form_ids), f"Lesson {i + 1}")
            made, failed, seconds = made + m, failed + f, seconds + s

    for sc in content.scenarios:
        data = await lessons.scenario(sc["id"], lang)
        if data["ai_error"]:
            print(f"  {sc['title']['en']}: the AI was busy ({data['ai_error']}). Run this again in a minute.")
        if not args.no_voice:
            m, f, s = await make_all(voice, scenario_clips(data), sc["title"]["en"])
            made, failed, seconds = made + m, failed + f, seconds + s

    cost = audio_cost(seconds, settings.gemini_tts_model)
    print()
    print(f"Done in {time.monotonic() - start:.0f} s. Made {made} new voice clips ({seconds / 60:.1f} min of audio).")
    if cost is not None:
        print(f"Voice cost for this run: about ${cost:.2f} (lesson text costs a fraction of a cent).")
    if failed:
        print(f"{failed} clips didn't finish. Run the same command again to fill them in.")
    else:
        print("Everything is saved. The demo will replay these instantly and for free.")


if __name__ == "__main__":
    asyncio.run(main())
