import re

from app.content import load_content
from app.quiz import blank_example

content = load_content()


def word_in(text: str, phrase: str) -> bool:
    return re.search(r"(?<![\w])" + re.escape(phrase) + r"(?![\w])", text, re.IGNORECASE) is not None


def test_has_at_least_50_terms():
    assert len(content.terms) >= 50


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


def test_every_example_can_be_blanked():
    for t in content.terms:
        assert blank_example(t) is not None, f"{t.id} example does not contain the term"


def test_languages_have_every_ui_string():
    for lang in content.languages:
        missing = set(content.english_ui) - set(lang.ui)
        assert not missing, f"{lang.code} is missing UI strings: {sorted(missing)}"


def test_scenarios_use_real_terms_and_titles():
    codes = {lang.code for lang in content.languages}
    for s in content.scenarios:
        for tid in s["target_terms"]:
            assert tid in content.terms_by_id, f"{s['id']} uses unknown term {tid}"
        assert codes <= set(s["title"]), f"{s['id']} is missing a title translation"


def test_no_em_dashes_in_learner_text():
    for t in content.terms:
        assert "\u2014" not in t.definition + t.example
