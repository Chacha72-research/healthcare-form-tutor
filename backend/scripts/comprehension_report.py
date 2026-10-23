"""Compare each learner's pre-lesson and post-lesson quiz scores.

Usage (from the backend folder):
    python scripts/comprehension_report.py
    python scripts/comprehension_report.py --file path/to/quiz_results.jsonl

Uses each learner's FIRST "pre" quiz and LAST "post" quiz.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent.parent / "data" / "results" / "quiz_results.jsonl"


def load(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"No results yet at {path}")
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT)
    args = parser.parse_args()

    rows = load(args.file)
    pre: dict[str, dict] = {}
    post: dict[str, dict] = {}
    for row in rows:
        code = row.get("learner_code") or ""
        if not code:
            continue
        if row["phase"] == "pre" and code not in pre:
            pre[code] = row
        elif row["phase"] == "post":
            post[code] = row

    learners = sorted(set(pre) | set(post))
    if not learners:
        raise SystemExit("No quizzes with a learner code and a pre/post phase yet.")

    print(f"{'Learner':<10}{'Before':>10}{'After':>10}")
    pre_scores, post_scores = [], []
    def fmt(row: dict | None) -> str:
        return f"{row['score']}/{row['total']}" if row else "-"

    for code in learners:
        b = pre.get(code)
        a = post.get(code)
        print(f"{code:<10}{fmt(b):>10}{fmt(a):>10}")
        if b and a:
            pre_scores.append(b["score"] / b["total"])
            post_scores.append(a["score"] / a["total"])

    if pre_scores:
        n = len(pre_scores)
        print(f"\nLearners with both quizzes: {n}")
        print(f"Average before: {sum(pre_scores) / n:.0%}")
        print(f"Average after:  {sum(post_scores) / n:.0%}")

    # Which words are still hard after the lesson?
    misses: dict[str, int] = defaultdict(int)
    for row in post.values():
        for ans in row["answers"]:
            if not ans["correct"]:
                misses[ans["term_id"]] += 1
    if misses:
        print("\nWords missed most after the lesson:")
        for term_id, count in sorted(misses.items(), key=lambda kv: -kv[1])[:5]:
            print(f"  {term_id}: {count}")


if __name__ == "__main__":
    main()
