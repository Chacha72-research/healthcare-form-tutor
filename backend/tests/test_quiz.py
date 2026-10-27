from app.content import load_content
from app.quiz import BLANK, ORDER, build_quiz

content = load_content()


def test_quiz_has_eight_questions_by_default():
    quiz = build_quiz(content, seed=1)
    assert quiz["total"] == 8


def test_questions_go_from_easiest_to_hardest():
    quiz = build_quiz(content, seed=2)
    ranks = [ORDER.index(q["type"]) for q in quiz["questions"]]
    assert ranks == sorted(ranks)
    assert {q["type"] for q in quiz["questions"]} == set(ORDER)


def test_short_word_lists_get_shorter_quizzes():
    quiz = build_quiz(content, ["copay", "deductible"], seed=3)
    assert quiz["total"] == 4
    assert {q["term_id"] for q in quiz["questions"]} == {"copay", "deductible"}


def test_unknown_ids_are_ignored():
    quiz = build_quiz(content, ["not_a_term", "copay"], seed=3)
    assert {q["term_id"] for q in quiz["questions"]} == {"copay"}


def test_option_counts_and_answers():
    quiz = build_quiz(content, n=16, seed=4)
    for q in quiz["questions"]:
        ids = [o["id"] for o in q["options"]]
        assert len(ids) == len(set(ids))
        assert q["answer_id"] in ids
        expected = {"either_or": 2, "yes_no": 2, "meaning": 4, "fill": 4}[q["type"]]
        assert len(ids) == expected


def test_yes_no_answer_matches_definition_shown():
    quiz = build_quiz(content, n=20, seed=5)
    for q in quiz["questions"]:
        if q["type"] == "yes_no":
            assert (q["prompt"] == q["definition"]) == (q["answer_id"] == "yes")


def test_fill_questions_hide_the_word():
    quiz = build_quiz(content, n=20, seed=6)
    fills = [q for q in quiz["questions"] if q["type"] == "fill"]
    assert fills and all(BLANK in q["prompt"] for q in fills)


def test_same_seed_same_quiz():
    assert build_quiz(content, seed="class-a") == build_quiz(content, seed="class-a")
