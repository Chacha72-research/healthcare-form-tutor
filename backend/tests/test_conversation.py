"""Drives the Gemini Live relay with a fake Gemini session (no network)."""

import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient
from google import genai

from app.config import Settings
from app.content import load_content
from app.main import create_app

content = load_content()


def msg(audio=None, said=None, heard=None, done=False):
    parts = [SimpleNamespace(inline_data=SimpleNamespace(data=audio))] if audio else []
    return SimpleNamespace(
        server_content=SimpleNamespace(
            model_turn=SimpleNamespace(parts=parts) if parts else None,
            output_transcription=SimpleNamespace(text=said) if said else None,
            input_transcription=SimpleNamespace(text=heard) if heard else None,
            interrupted=False,
            turn_complete=done,
        )
    )


class FakeSession:
    def __init__(self):
        self.opening = None
        self.audio_in = []
        self.got_audio = asyncio.Event()
        self.turn = 0

    async def send_client_content(self, turns, turn_complete):
        self.opening = turns

    async def send_realtime_input(self, audio):
        self.audio_in.append(audio)
        self.got_audio.set()

    async def receive(self):
        self.turn += 1
        if self.turn == 1:
            yield msg(audio=b"\x01\x00\x02\x00", said="Hi, welcome to the clinic.")
            yield msg(done=True)
        elif self.turn == 2:
            await self.got_audio.wait()
            yield msg(heard="Yes, check in please.", done=True)
        else:
            await asyncio.sleep(3600)


class FakeClient:
    last_config = None
    session = None

    def __init__(self, api_key):
        self.aio = SimpleNamespace(live=SimpleNamespace(connect=self.connect))

    def connect(self, model, config):
        FakeClient.last_config = config
        FakeClient.session = FakeSession()
        session = FakeClient.session

        class Ctx:
            async def __aenter__(self):
                return session

            async def __aexit__(self, *exc):
                return False

        return Ctx()


def test_relay_forwards_audio_and_captions(monkeypatch, tmp_path):
    monkeypatch.setattr(genai, "Client", FakeClient)
    settings = Settings(anthropic_api_key="", gemini_api_key="fake", results_path=tmp_path / "r.jsonl")
    client = TestClient(create_app(settings=settings, content=content))

    with client.websocket_connect("/ws/conversation?scenario=pharmacy&language=zh-Hans") as ws:
        assert ws.receive_json() == {"type": "ready"}
        assert ws.receive_bytes() == b"\x01\x00\x02\x00"
        assert ws.receive_json() == {"type": "transcript", "role": "partner", "text": "Hi, welcome to the clinic."}
        assert ws.receive_json() == {"type": "turn_complete"}

        ws.send_bytes(b"\x00\x00" * 160)
        assert ws.receive_json() == {"type": "transcript", "role": "learner", "text": "Yes, check in please."}
        assert ws.receive_json() == {"type": "turn_complete"}
        ws.send_json({"type": "end"})

    session = FakeClient.session
    assert session.audio_in[0].mime_type == "audio/pcm;rate=16000"
    instruction = FakeClient.last_config.system_instruction.parts[0].text
    assert "pharmacist" in instruction and "Simplified Chinese" in instruction
