import re

from app.content import load_content
from app.quiz import blank_example

content = load_content()


def word_in(text: str, phrase: str) -> bool:
    return re.search(r"(?<![\w])" + re.escape(phrase) + r"(?![\w])", text, re.IGNORECASE) is not None


def test_has_at_least_70_terms():
    assert len(content.terms) >= 70


def test_ids_are_unique():
    ids = [t.id for t in content.terms]
    assert len(ids) == len(set(ids))


def test_definitions_are_one_short_plain_sentence():
    for t in content.terms:
        assert t.definition.endswith("."), t.id
        assert len(t.definition.split()) <= 22, f"{t.id} definition is too long"


def test_definitions_do_not_give_away_the_word():
    # The quiz shows a definition and asks for the word, so the word can't be inside it.
    for t in content.terms:
        for phrase in (t.term, *t.aliases):
            assert not word_in(t.definition, phrase), f"{t.id}: '{phrase}' appears in its definition"


def test_check_questions_follow_ccq_rules():
    # Concept-checking questions ask about the meaning without saying the word.
    for t in content.terms:
        eo, yn = t.check["either_or"], t.check["yes_no"]
        assert len(eo["options"]) == 2 and eo["answer"] in eo["options"], t.id
        assert isinstance(yn["answer"], bool), t.id
        for q in (eo["q"], yn["q"]):
            assert q.endswith("?"), t.id
            for phrase in (t.term, *t.aliases):
                assert not word_in(q, phrase), f"{t.id}: check question says '{phrase}'"


def test_every_term_has_pronunciation_and_casas():
    for t in content.terms:
        assert any(c.isupper() for c in t.say), f"{t.id} needs a stressed syllable in capitals"
        assert t.casas, f"{t.id} needs at least one CASAS competency"


def test_every_example_can_be_blanked():
    for t in content.terms:
        assert blank_example(t) is not None, f"{t.id} example does not contain the term"


def test_languages_have_every_ui_string():
    for lang in content.languages:
        missing = set(content.english_ui) - set(lang.ui)
        assert not missing, f"{lang.code} is missing UI strings: {sorted(missing)}"


def test_tamil_is_included():
    assert content.language("ta") is not None


def test_placeholders_match_english():
    for lang in content.languages:
        for key, english in content.english_ui.items():
            want = set(re.findall(r"\{\w+\}", english))
            got = set(re.findall(r"\{\w+\}", lang.ui[key]))
            assert want == got, f"{lang.code}.{key} placeholders {got} != {want}"


def test_scenarios_are_complete():
    codes = {lang.code for lang in content.languages} | {"en"}
    for s in content.scenarios:
        for tid in s["target_terms"]:
            assert tid in content.terms_by_id, f"{s['id']} uses unknown term {tid}"
        assert codes <= set(s["title"]), f"{s['id']} is missing a title translation"
        assert codes <= set(s["goal"]), f"{s['id']} is missing a goal translation"
        assert s["dialogue"][0]["who"] == "staff"
        types = [q["type"] for q in s["questions"]]
        order = {"either_or": 0, "yes_no": 1, "wh": 2}
        assert types == sorted(types, key=order.get), f"{s['id']} questions are not easiest-first"
        for q in s["questions"]:
            if q["type"] != "yes_no":
                assert q["answer"] in q["options"], f"{s['id']}: {q['q']}"


def test_scenarios_cover_insurance_and_billing_words():
    used = {tid for s in content.scenarios for tid in s["target_terms"]}
    for tid in ["copay", "deductible", "in_network", "referral", "prior_authorization", "explanation_of_benefits",
                "balance_due", "claim", "interpreter", "prescription"]:
        assert tid in used, f"no practice situation uses {tid}"


EM_DASH = "\u2014"


def test_no_em_dashes_anywhere_learners_see():
    for t in content.terms:
        assert EM_DASH not in t.definition + t.example
    for lang in content.languages:
        for value in lang.ui.values():
            assert EM_DASH not in value
    for s in content.scenarios:
        for line in s["dialogue"]:
            assert EM_DASH not in line["text"]


def test_every_term_has_a_short_tip_and_a_confusing_flag():
    for t in content.terms:
        assert t.tip and t.tip.endswith((".", "?")), t.id
        assert len(t.tip.split()) <= 25, f"{t.id} tip is too long"
        assert EM_DASH not in t.tip
    assert 25 <= sum(t.confusing for t in content.terms) <= 50
