import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.content import load_content
from app.main import create_app
from tests.fakes import FakeAI, FakeVoice

content = load_content()
SAMPLE_PDF = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample-form.pdf"


def make_client(tmp_path, ai=None, voice=None, live=False):
    settings = Settings(
        gemini_api_key="fake" if live else "",
        anthropic_api_key="",
        results_path=tmp_path / "results.jsonl",
        generated_dir=tmp_path / "generated",
        audio_cache_dir=tmp_path / "audio",
    )
    return TestClient(create_app(settings=settings, content=content, ai=ai, voice=voice))


def upload(client, data: bytes, name: str, mime: str):
    return client.post("/api/forms/read", files={"file": (name, data, mime)})


def test_config_lists_tamil_scenarios_and_features(tmp_path):
    client = make_client(tmp_path, ai=FakeAI(), voice=FakeVoice())
    data = client.get("/api/config").json()
    assert {lang["code"] for lang in data["languages"]} == {"ta", "es", "zh-Hans", "vi"}
    assert len(data["scenarios"]) == 6
    assert data["pretend_patient"]["name"] == "Sam Lee"
    assert data["features"] == {"ai": True, "voice": True, "live": False}


def test_pdf_with_text_is_read_for_free(tmp_path):
    ai = FakeAI()
    client = make_client(tmp_path, ai=ai)
    resp = upload(client, SAMPLE_PDF.read_bytes(), "form.pdf", "application/pdf")
    assert resp.status_code == 200
    body = resp.json()
    ids = [t["id"] for t in body["terms"]]
    assert body["source"] == "text"
    assert {"copay", "deductible", "member_id", "date_of_birth", "emergency_contact"} <= set(ids)
    assert "Patient Name" in body["unlisted"]
    assert ai.calls == []  # no AI needed for a digital PDF

    line = next(ln for ln in body["lines"] if "copay" in ln["text"])
    mark = next(m for m in line["marks"] if m["term_id"] == "copay")
    assert line["text"][mark["start"] : mark["end"]].lower() == "copay"


def test_text_file_works_without_any_key(tmp_path):
    client = make_client(tmp_path, ai=None)
    resp = upload(client, b"Insurance Card\nMember ID:\nCopay: $20\nER visits", "form.txt", "text/plain")
    ids = [t["id"] for t in resp.json()["terms"]]
    assert ids == ["insurance_card", "member_id", "copay", "emergency_room"]


def test_abbreviations_are_case_sensitive(tmp_path):
    client = make_client(tmp_path)
    resp = upload(client, b"Put ice on it. Bring your DOB.", "f.txt", "text/plain")
    assert [t["id"] for t in resp.json()["terms"]] == ["date_of_birth"]


def test_pictures_need_ai(tmp_path):
    client = make_client(tmp_path, ai=None)
    resp = upload(client, b"\x89PNGfake", "form.png", "image/png")
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "picture_needs_ai"


def test_pictures_are_read_by_ai_then_matched_locally(tmp_path):
    ai = FakeAI(labels=["Primary Insurance", "Policyholder", "Deductible", "Not a real term"])
    client = make_client(tmp_path, ai=ai)
    resp = upload(client, b"\xff\xd8fakejpeg", "form.jpg", "image/jpeg")
    body = resp.json()
    assert body["source"] == "ai"
    assert [t["id"] for t in body["terms"]] == ["primary_insurance", "policyholder", "deductible"]
    assert ai.calls[0]["files"][0].mime_type == "image/jpeg"


def test_busy_ai_returns_429(tmp_path):
    client = make_client(tmp_path, ai=FakeAI(busy=True))
    resp = upload(client, b"\xff\xd8fakejpeg", "form.jpg", "image/jpeg")
    assert resp.status_code == 429 and resp.json()["detail"]["code"] == "ai_busy"


def test_unsupported_file(tmp_path):
    client = make_client(tmp_path)
    resp = upload(client, b"PK\x03\x04", "form.docx", "application/vnd.openxmlformats-officedocument")
    assert resp.status_code == 415


def test_lesson_fills_learner_language_and_caches_it(tmp_path):
    ai = FakeAI()
    client = make_client(tmp_path, ai=ai)
    body = client.get("/api/lesson", params={"terms": "copay,deductible", "language": "ta"}).json()
    copay = body["words"][0]
    assert copay["id"] == "copay" and copay["say"] == "CO-pay"
    assert copay["l1"]["meaning"] == "MEANING copay"
    assert copay["l1"]["either_or_q"] == "[L1] Do you pay it every visit or once a year?"
    assert copay["l1"]["either_or_options"] == ["[L1] every visit", "[L1] once a year"]
    assert body["ai_error"] is None

    # Tamil style guidance went to the AI.
    assert "spoken Tamil" in ai.calls[0]["system"]

    # Second request is served from the saved file, not the AI.
    before = len(ai.calls)
    client.get("/api/lesson", params={"terms": "copay", "language": "ta"})
    assert len(ai.calls) == before
    saved = json.loads((tmp_path / "generated" / "ta.json").read_text(encoding="utf-8"))
    assert saved["terms"]["copay"]["approved"] is False


def test_lesson_still_works_in_english_without_ai(tmp_path):
    client = make_client(tmp_path, ai=None)
    body = client.get("/api/lesson", params={"terms": "copay", "language": "vi"}).json()
    word = body["words"][0]
    assert word["definition"].startswith("A set amount")
    assert word["l1"]["meaning"] is None
    assert body["ai_available"] is False


def test_lesson_reports_busy_ai_but_still_answers(tmp_path):
    ai = FakeAI(busy=True)
    client = make_client(tmp_path, ai=ai)
    body = client.get("/api/lesson", params={"terms": "copay", "language": "es"}).json()
    assert body["ai_error"] == "ai_busy"
    assert body["words"][0]["term"] == "Copay"
    assert len(ai.calls) == 1  # stops after the first "busy" instead of spending more quota


def test_scenario_has_dialogue_questions_and_translations(tmp_path):
    client = make_client(tmp_path, ai=FakeAI())
    body = client.get("/api/scenarios/make_appointment", params={"language": "ta"}).json()
    assert body["dialogue"][0]["who"] == "staff"
    assert any(d["text"] == "Tamil, please." for d in body["dialogue"])
    assert body["dialogue"][0]["l1"].startswith("[L1]")
    assert body["questions"][0]["type"] == "either_or"
    assert body["goal"]["ta"]
    assert client.get("/api/scenarios/nope", params={"language": "ta"}).status_code == 404


def test_unknown_language(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/lesson", params={"terms": "copay", "language": "xx"}).status_code == 400


def test_quiz_and_results_round_trip(tmp_path):
    client = make_client(tmp_path)
    quiz = client.get("/api/quiz", params={"terms": "copay,deductible,referral,claim", "seed": "x"}).json()
    assert quiz["total"] == 8
    answers = [{"term_id": q["term_id"], "type": q["type"], "correct": i < 6} for i, q in enumerate(quiz["questions"])]
    resp = client.post(
        "/api/quiz/results", json={"learner_code": "a3", "phase": "post", "language": "ta", "answers": answers}
    )
    assert resp.json() == {"score": 6, "total": 8}
    saved = json.loads((tmp_path / "results.jsonl").read_text().strip())
    assert saved["learner_code"] == "A3"


def test_results_reject_names_with_spaces(tmp_path):
    client = make_client(tmp_path)
    resp = client.post("/api/quiz/results", json={"learner_code": "Maria Lopez", "phase": "pre", "answers": []})
    assert resp.status_code == 422


def test_speech_uses_voice_and_validates_input(tmp_path):
    voice = FakeVoice()
    client = make_client(tmp_path, voice=voice)
    resp = client.get("/api/speech", params={"text": "வணக்கம்", "voice": "tutor", "style": "tutor"})
    assert resp.status_code == 200 and resp.headers["content-type"] == "audio/wav"
    assert voice.calls == [("வணக்கம்", "tutor", "tutor")]
    assert client.get("/api/speech", params={"text": "hi", "voice": "robot"}).status_code == 422


def test_speech_off_without_key(tmp_path):
    client = make_client(tmp_path, voice=None)
    assert client.get("/api/speech", params={"text": "hi"}).status_code == 501


def test_conversation_reports_not_configured(tmp_path):
    client = make_client(tmp_path)
    with client.websocket_connect("/ws/conversation?scenario=front_desk&language=ta") as ws:
        assert ws.receive_json() == {"type": "error", "message": "not_configured"}


@pytest.mark.parametrize("scenario_id", [s["id"] for s in content.scenarios])
def test_conversation_instruction_builds(scenario_id):
    from app.conversation import build_instruction

    text = build_instruction(content.scenarios_by_id[scenario_id], content.language("ta"), content)
    assert "Tamil" in text and "Sam Lee" in text and "recast" in text
    assert content.scenarios_by_id[scenario_id]["opening"] in text


def test_explain_gives_meaning_tip_and_flags(tmp_path):
    ai = FakeAI()
    client = make_client(tmp_path, ai=ai)
    body = client.get("/api/explain", params={"terms": "copay,date_of_birth", "language": "ta"}).json()
    copay, dob = body["terms"]
    assert copay["confusing"] is True and dob["confusing"] is False
    assert copay["tip"].startswith("Nothing to fill in")
    assert copay["l1"] == {"meaning": "MEANING copay", "example_meaning": "EXAMPLE copay", "tip": "TIP copay", "approved": False}
    assert body["ai_error"] is None
    # Both words fit in one batch, so one AI call; asking again uses the saved copy.
    assert len(ai.calls) == 1
    client.get("/api/explain", params={"terms": "copay", "language": "ta"})
    assert len(ai.calls) == 1


def test_explain_refreshes_old_entries_without_a_tip(tmp_path):
    gen = tmp_path / "generated"
    gen.mkdir()
    (gen / "ta.json").write_text(json.dumps({"terms": {"copay": {"meaning": "old", "example_meaning": "old", "approved": False}}, "lines": {}}))
    ai = FakeAI()
    client = make_client(tmp_path, ai=ai)
    body = client.get("/api/explain", params={"terms": "copay", "language": "ta"}).json()
    assert body["terms"][0]["l1"]["tip"] == "TIP copay"


def test_form_reading_marks_confusing_words(tmp_path):
    client = make_client(tmp_path)
    resp = upload(client, SAMPLE_PDF.read_bytes(), "form.pdf", "application/pdf")
    terms = {t["id"]: t["confusing"] for t in resp.json()["terms"]}
    assert terms["copay"] is True and terms["date_of_birth"] is False
    assert sum(terms.values()) >= 12
