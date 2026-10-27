"""Spoken English conversation simulator on the Gemini Live API.

The browser streams microphone audio (16 kHz, 16-bit PCM) over a websocket to
this server, and the server relays it to Gemini Live. Gemini's spoken replies
(24 kHz, 16-bit PCM) and live captions are relayed back. Keeping the relay on
the server means the Gemini API key never reaches the learner's phone.

Websocket protocol (browser <-> this server):
  browser -> server   binary frame: raw PCM16 mono 16 kHz mic audio
  browser -> server   text frame:   {"type": "end"}
  server  -> browser  binary frame: raw PCM16 mono 24 kHz partner audio
  server  -> browser  text frame:   {"type": "ready"}
                                    {"type": "transcript", "role": "learner"|"partner", "text": "..."}
                                    {"type": "interrupted"}
                                    {"type": "turn_complete"}
                                    {"type": "error", "message": "..."}
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .config import Settings
from .content import Content, Language

log = logging.getLogger(__name__)

INPUT_MIME = "audio/pcm;rate=16000"


def _patient_card(patient: dict) -> str:
    copays = ", ".join(f"{k} {v}" for k, v in patient.get("copays", {}).items())
    return (
        f"Name: {patient['name']}. Date of birth: {patient['date_of_birth_spoken']}. "
        f"Insurance: {patient['plan']} ({patient['plan_type']}). Member ID: {patient['member_id']}. "
        f"Group number: {patient['group_number']}. Primary care provider: {patient['primary_care_provider']}. "
        f"Copays: {copays}. Deductible: {patient['deductible']} a year. "
        f"Allergy: {patient['allergy']}. Emergency contact: {patient['emergency_contact']}."
    )


def build_instruction(scenario: dict, language: Language, content: Content) -> str:
    lang = language.english_name.split(" (")[0]
    words = []
    for tid in scenario.get("target_terms", []):
        term = content.terms_by_id.get(tid)
        if term:
            words.append(f"- {term.term}: {term.definition}")
    word_list = "\n".join(words)
    phrases = "\n".join(f"- {p}" for p in scenario.get("useful_phrases", []))
    card = _patient_card(content.pretend_patient)

    return f"""You are a role-play partner for an adult English learner practicing a real U.S. healthcare situation out loud. The learner is a beginner (English level 1 to 2). Their first language is {lang}.

YOUR ROLE: {scenario['role']}.
SITUATION: {scenario['situation']}

THE LEARNER plays a patient named {content.pretend_patient['name']} and reads from a pretend insurance card:
{card}
Accept these pretend details as correct. Never ask for the learner's real name, real numbers, or address.

WORDS TO USE NATURALLY (this is what the learner is studying):
{word_list}

PHRASES THE LEARNER PRACTICED (expect and welcome these):
{phrases}

HOW TO TALK (adult ESL teaching practice):
- First, say one short, friendly sentence in {lang} that explains the situation. Then switch to English and start with: "{scenario['opening']}"
- Speak slowly and clearly. Use short sentences, under 12 words when you can.
- Ask one question at a time, then wait. Allow long pauses; beginners need time.
- If the learner makes a mistake, don't correct them directly. Repeat their idea back correctly in your answer (a recast), then continue.
- If they don't understand, say it again with easier words. If they are stuck twice in a row, give one short hint in {lang}, then go back to English.
- If they ask what a word means, explain it in one simple English sentence.
- Stay in the situation. Do not give medical advice beyond the facts in the situation.
- Be warm and patient. Praise effort, not perfection.

ENDING:
- After about 8 to 10 back-and-forth turns, finish the situation kindly.
- Then step out of the role and say, in simple English and then in {lang}: one thing the learner did well, and one word from the list to practice more."""


async def run_conversation(
    websocket: WebSocket,
    scenario: dict,
    language: Language,
    content: Content,
    settings: Settings,
) -> None:
    # Imported here so the rest of the app still works if google-genai is missing.
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)

    speech_config = None
    if settings.staff_voice:
        speech_config = types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=settings.staff_voice)
            )
        )

    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=types.Content(parts=[types.Part(text=build_instruction(scenario, language, content))]),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        speech_config=speech_config,
    )

    async with client.aio.live.connect(model=settings.gemini_live_model, config=config) as session:
        await websocket.send_json({"type": "ready"})
        # Nudge the partner to speak first with its opening line.
        await session.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text="(The learner is here. Begin the role-play now.)")],
            ),
            turn_complete=True,
        )

        async def browser_to_gemini() -> None:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return
                if message.get("bytes"):
                    await session.send_realtime_input(
                        audio=types.Blob(data=message["bytes"], mime_type=INPUT_MIME)
                    )
                elif message.get("text"):
                    try:
                        data = json.loads(message["text"])
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") == "end":
                        return

        async def gemini_to_browser() -> None:
            # session.receive() yields one model turn, then stops, so keep looping.
            # A turn with no messages at all means Gemini closed the session.
            while True:
                got_any = False
                async for response in session.receive():
                    got_any = True
                    content_ = response.server_content
                    if content_ is None:
                        continue
                    if content_.model_turn:
                        for part in content_.model_turn.parts or []:
                            if part.inline_data and part.inline_data.data:
                                await websocket.send_bytes(part.inline_data.data)
                    if content_.input_transcription and content_.input_transcription.text:
                        await websocket.send_json(
                            {"type": "transcript", "role": "learner", "text": content_.input_transcription.text}
                        )
                    if content_.output_transcription and content_.output_transcription.text:
                        await websocket.send_json(
                            {"type": "transcript", "role": "partner", "text": content_.output_transcription.text}
                        )
                    if content_.interrupted:
                        await websocket.send_json({"type": "interrupted"})
                    if content_.turn_complete:
                        await websocket.send_json({"type": "turn_complete"})
                if not got_any:
                    await websocket.send_json({"type": "error", "message": "session_ended"})
                    return

        tasks = {
            asyncio.create_task(browser_to_gemini()),
            asyncio.create_task(gemini_to_browser()),
        }
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                raise exc
