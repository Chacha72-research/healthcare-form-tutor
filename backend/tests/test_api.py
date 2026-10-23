import json
from dataclasses import replace
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.content import load_content
from app.explain import Explainer, build_system_prompt
from app.main import create_app

content = load_content()


class FakeMessages:
    """Stands in for client.messages so tests never call the real API."""

    def __init__(self, tool_input):
        self.tool_input = tool_input
        self.last_call = None

    async def create(self, **kwargs):
        self.last_call = kwargs
        return SimpleNamespace(content=[SimpleNamespace(type="tool_use", input=self.tool_input)])


def make_client(tool_input, tmp_path, content_=content):
    fake = SimpleNamespace(messages=FakeMessages(tool_input))
    explainer = Explainer(fake, "test-model", content_)
    settings = Settings(
        anthropic_api_key="test",
        gemini_api_key="",
        tts_provider="browser",
        results_path=tmp_path / "results.jsonl",
    )
    return TestClient(create_app(settings=settings, content=content_, explainer=explainer)), fake


FAKE_ANSWER = {
    "readable": True,
    "form_summary": "Este es un formulario para pacientes nuevos.",
    "terms": [
        {"term_id": "copay", "form_text": "Copay", "explanation": "Dinero fijo que paga en cada visita."},
        {"term_id": "made_up_term", "form_text": "Zorp", "explanation": "No existe."},
        {"term_id": "copay", "form_text": "Co-pay", "explanation": "Duplicado."},
        {"term_id": "date_of_birth", "form_text": "DOB", "explanation": "El día en que nació."},
    ],
    "unlisted_terms": ["Ethnicity"],
}


def post_photo(client, language="es"):
    return client.post(
        "/api/explain",
        files={"file": ("form.jpg", b"\xff\xd8fakejpeg", "image/jpeg")},
        data={"language": language},
    )


def test_config_lists_languages_and_features(tmp_path):
    client, _ = make_client(FAKE_ANSWER, tmp_path)
    data = client.get("/api/config").json()
    assert {lang["code"] for lang in data["languages"]} == {"es", "zh-Hans", "vi"}
    assert data["features"] == {"scan": True, "conversation": False, "server_tts": False}


def test_explain_keeps_only_glossary_terms(tmp_path):
    client, fake = make_client(FAKE_ANSWER, tmp_path)
    resp = post_photo(client)
    assert resp.status_code == 200
    body = resp.json()
    assert [t["id"] for t in body["terms"]] == ["copay", "date_of_birth"]
    assert body["terms"][0]["definition"] == content.terms_by_id["copay"].definition
    assert body["terms"][0]["explanation_source"] == "ai"
    assert body["unlisted_terms"] == ["Ethnicity"]

    # The request forces the tool and caches the glossary prompt.
    call = fake.messages.last_call
    assert call["tool_choice"] == {"type": "tool", "name": "report_form_terms"}
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert call["messages"][0]["content"][0]["type"] == "image"


def test_vetted_translation_replaces_ai_text(tmp_path):
    vetted_terms = [
        replace(t, translations={"es": "Un pago fijo en cada visita."}) if t.id == "copay" else t
        for t in content.terms
    ]
    vetted = replace(content, terms=vetted_terms)
    vetted.__post_init__()
    client, _ = make_client(FAKE_ANSWER, tmp_path, vetted)
    copay = post_photo(client).json()["terms"][0]
    assert copay["explanation"] == "Un pago fijo en cada visita."
    assert copay["explanation_source"] == "vetted"


def test_explain_rejects_unknown_language_and_bad_files(tmp_path):
    client, _ = make_client(FAKE_ANSWER, tmp_path)
    assert post_photo(client, language="xx").status_code == 400
    resp = client.post(
        "/api/explain",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"language": "es"},
    )
    assert resp.status_code == 415


def test_scan_is_off_without_key(tmp_path):
    settings = Settings(anthropic_api_key="", results_path=tmp_path / "r.jsonl")
    client = TestClient(create_app(settings=settings, content=content))
    assert client.get("/api/config").json()["features"]["scan"] is False
    assert post_photo(client).status_code == 503


def test_quiz_and_results_round_trip(tmp_path):
    client, _ = make_client(FAKE_ANSWER, tmp_path)
    quiz = client.get("/api/quiz", params={"terms": "copay,deductible", "seed": "x"}).json()
    assert quiz["total"] == 8

    answers = [
        {"term_id": q["term_id"], "type": q["type"], "correct": i < 6} for i, q in enumerate(quiz["questions"])
    ]
    resp = client.post(
        "/api/quiz/results",
        json={"learner_code": "a3", "phase": "post", "language": "es", "answers": answers},
    )
    assert resp.json() == {"score": 6, "total": 8}

    saved = json.loads((tmp_path / "results.jsonl").read_text().strip())
    assert saved["learner_code"] == "A3" and saved["phase"] == "post"


def test_results_reject_names_with_spaces(tmp_path):
    client, _ = make_client(FAKE_ANSWER, tmp_path)
    resp = client.post(
        "/api/quiz/results",
        json={"learner_code": "Maria Lopez", "phase": "pre", "answers": []},
    )
    assert resp.status_code == 422


def test_tts_off_by_default(tmp_path):
    client, _ = make_client(FAKE_ANSWER, tmp_path)
    assert client.get("/api/tts", params={"text": "copay", "lang": "en-US"}).status_code == 501


def test_conversation_reports_not_configured(tmp_path):
    client, _ = make_client(FAKE_ANSWER, tmp_path)
    with client.websocket_connect("/ws/conversation?scenario=front_desk&language=es") as ws:
        assert ws.receive_json() == {"type": "error", "message": "not_configured"}


def test_system_prompt_contains_every_term():
    prompt = build_system_prompt(content)
    for t in content.terms:
        assert t.id in prompt


@pytest.mark.parametrize("scenario_id", ["front_desk", "make_appointment", "pharmacy"])
def test_conversation_instruction_builds(scenario_id):
    from app.conversation import build_instruction

    text = build_instruction(content.scenarios_by_id[scenario_id], content.language("vi"), content)
    assert "Vietnamese" in text and "pretend" in text
