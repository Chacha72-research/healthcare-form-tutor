"""The short "how it works" stories."""

from fastapi.testclient import TestClient

from app.concepts import concept_lines, load_concepts
from app.config import Settings
from app.content import load_content
from app.main import create_app
from tests.fakes import FakeAI

content = load_content()
EM_DASH = "—"


def test_stories_are_short_simple_and_complete():
    papers = {"new_patient", "card", "eob", "bill", "sbc", "intro"}
    codes = {lang.code for lang in content.languages} | {"en"}
    for c in load_concepts():
        assert c["paper"] in papers
        assert codes <= set(c["title"]), c["id"]
        assert 3 <= len(c["cards"]) <= 5, "keep stories short"
        for card in c["cards"]:
            assert len(card["say"].split()) <= 10, f"{c['id']}: '{card['say']}' is too long for beginners"
            assert len(card["explain"].split()) <= 45
        if c["id"] != "big_picture":
            assert c["checks"], c["id"]
        for check in c["checks"]:
            assert check["answer"] in check["options"] and check["q"].endswith("?")
        assert not any(EM_DASH in line for line in concept_lines(c))


def test_story_endpoint_translates_every_line(tmp_path):
    settings = Settings(gemini_api_key="", anthropic_api_key="", results_path=tmp_path / "r.jsonl",
                        generated_dir=tmp_path / "g", audio_cache_dir=tmp_path / "a")
    client = TestClient(create_app(settings=settings, content=content, ai=FakeAI(), voice=None))
    assert len(client.get("/api/forms").json()["concepts"]) == 6
    data = client.get("/api/concepts/who_pays_what", params={"language": "ta"}).json()
    card = data["cards"][0]
    assert card["say_l1"] == f"[L1] {card['say']}" and card["explain_l1"].startswith("[L1] ")
    assert data["checks"][0]["options_l1"][0].startswith("[L1] ")
    assert client.get("/api/concepts/nope", params={"language": "ta"}).status_code == 404


def test_big_picture_follows_one_visit_from_start_to_bill():
    bp = next(c for c in load_concepts() if c["id"] == "big_picture")
    actors = {"you", "clinic", "insurance"}
    flow = [(card["from"], card["to"]) for card in bp["cards"]]
    assert all(a in actors and b in actors and a != b for a, b in flow)
    assert flow[0] == ("you", "insurance") and flow[-1] == ("clinic", "you")
