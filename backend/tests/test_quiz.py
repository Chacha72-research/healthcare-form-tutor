from app.content import load_content
from app.quiz import BLANK, build_quiz

content = load_content()


def test_quiz_has_eight_questions_by_default():
    quiz = build_quiz(content, seed=1)
    assert quiz["total"] == 8
    assert len({q["term_id"] for q in quiz["questions"]}) == 8


def test_requested_terms_come_first():
    wanted = ["copay", "deductible", "referral"]
    quiz = build_quiz(content, wanted, seed=2)
    assert set(wanted) <= {q["term_id"] for q in quiz["questions"]}


def test_unknown_ids_are_ignored():
    quiz = build_quiz(content, ["not_a_term", "copay"], seed=3)
    ids = {q["term_id"] for q in quiz["questions"]}
    assert "not_a_term" not in ids and "copay" in ids


def test_each_question_has_four_unique_options_including_answer():
    quiz = build_quiz(content, seed=4)
    for q in quiz["questions"]:
        option_ids = [o["id"] for o in q["options"]]
        assert len(option_ids) == 4
        assert len(set(option_ids)) == 4
        assert q["answer_id"] in option_ids


def test_fill_questions_hide_the_word():
    quiz = build_quiz(content, n=20, seed=5)
    fills = [q for q in quiz["questions"] if q["type"] == "fill"]
    assert fills
    for q in fills:
        assert BLANK in q["prompt"]


def test_same_seed_same_quiz():
    assert build_quiz(content, seed="class-a") == build_quiz(content, seed="class-a")
