"""The built-in practice papers learners click through."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.content import load_content
from app.forms import TermMatcher
from app.main import create_app
from app.samples import load_samples
from tests.fakes import FakeAI

content = load_content()


def test_every_paper_loads_and_has_tricky_words():
    papers = load_samples(content, TermMatcher(content.terms))
    assert [p["id"] for p in papers] == ["new_patient", "card", "eob", "bill", "sbc"]
    codes = {lang.code for lang in content.languages} | {"en"}
    for p in papers:
        assert codes <= set(p["title"]) and codes <= set(p["about"]), p["id"]
        terms = p.get("terms") or p["reading"]["terms"]
        assert sum(t["confusing"] for t in terms) >= 3, p["id"]
        for t in terms:
            assert t["id"] in content.terms_by_id


def test_papers_teach_the_bill_and_benefit_words():
    papers = {p["id"]: p for p in load_samples(content, TermMatcher(content.terms))}
    eob = {t["id"] for t in papers["eob"]["reading"]["terms"]}
    assert {"explanation_of_benefits", "allowed_amount", "appeal", "out_of_pocket_max"} <= eob
    sbc = {t["id"] for t in papers["sbc"]["reading"]["terms"]}
    assert {"preventive_care", "prior_authorization", "referral", "out_of_network"} <= sbc


def test_forms_endpoint(tmp_path):
    settings = Settings(gemini_api_key="", anthropic_api_key="", results_path=tmp_path / "r.jsonl",
                        generated_dir=tmp_path / "g", audio_cache_dir=tmp_path / "a")
    client = TestClient(create_app(settings=settings, content=content, ai=FakeAI(), voice=None))
    data = client.get("/api/forms").json()
    assert len(data["forms"]) == 5
    assert data["forms"][2]["reading"]["lines"][0]["text"]
