"""Teacher review loop for glossary translations.

1. Export a spreadsheet for one language (optionally with AI draft translations):
       python scripts/translations.py export --lang es --draft
   This writes review_es.csv.

2. A teacher or bilingual volunteer opens the CSV, checks each draft, and
   types the final sentence in the approved_translation column.

3. Import the approved sentences back into the glossary:
       python scripts/translations.py import --lang es --csv review_es.csv

Approved translations are shown to learners word for word, so the app only
falls back to a live computer translation for terms nobody has approved yet.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
GLOSSARY = BACKEND / "data" / "glossary.json"
LANGUAGES = BACKEND / "data" / "languages.json"

sys.path.insert(0, str(BACKEND))


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def language_name(code: str) -> str:
    for lang in load_json(LANGUAGES)["languages"]:
        if lang["code"] == code:
            return lang["english_name"]
    raise SystemExit(f"Language '{code}' is not in data/languages.json")


def draft_translations(terms: list[dict], lang_name: str) -> dict[str, str]:
    from anthropic import Anthropic

    from app.config import settings

    if not settings.anthropic_api_key:
        raise SystemExit("Set ANTHROPIC_API_KEY in .env to make drafts, or run without --draft.")

    listing = "\n".join(f"{t['id']} | {t['term']} | {t['definition']}" for t in terms)
    tool = {
        "name": "save_translations",
        "description": "Save one translated sentence per glossary id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {"id": {"type": "string"}, "translation": {"type": "string"}},
                        "required": ["id", "translation"],
                    },
                }
            },
            "required": ["items"],
        },
    }
    client = Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=8000,
        tools=[tool],
        tool_choice={"type": "tool", "name": "save_translations"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"Translate each healthcare definition below into {lang_name} for adult beginners. "
                    "Write ONE short, plain sentence each, using everyday words. Keep the English term "
                    "in parentheses the first time it appears, for example (copay). Do not add information.\n\n"
                    f"id | term | definition\n{listing}"
                ),
            }
        ],
    )
    block = next(b for b in response.content if b.type == "tool_use")
    return {item["id"]: item["translation"] for item in block.input["items"]}


def export(lang: str, draft: bool, out: Path | None) -> None:
    glossary = load_json(GLOSSARY)
    terms = glossary["terms"]
    drafts = draft_translations(terms, language_name(lang)) if draft else {}
    out = out or Path(f"review_{lang}.csv")
    with out.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig opens cleanly in Excel
        writer = csv.writer(f)
        writer.writerow(["id", "term", "english_definition", "current_translation", "draft_translation", "approved_translation"])
        for t in terms:
            current = t.get("translations", {}).get(lang, "")
            writer.writerow([t["id"], t["term"], t["definition"], current, drafts.get(t["id"], ""), current])
    print(f"Wrote {out} with {len(terms)} terms.")


def import_csv(lang: str, path: Path) -> None:
    glossary = load_json(GLOSSARY)
    by_id = {t["id"]: t for t in glossary["terms"]}
    updated = 0
    with path.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            approved = (row.get("approved_translation") or "").strip()
            term = by_id.get(row.get("id", ""))
            if term is None or not approved:
                continue
            term.setdefault("translations", {})[lang] = approved
            updated += 1
    with GLOSSARY.open("w", encoding="utf-8") as f:
        json.dump(glossary, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Saved {updated} approved {lang} translations to {GLOSSARY.name}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_export = sub.add_parser("export", help="Write a review CSV for one language")
    p_export.add_argument("--lang", required=True)
    p_export.add_argument("--draft", action="store_true", help="Fill draft_translation with Claude")
    p_export.add_argument("--out", type=Path)

    p_import = sub.add_parser("import", help="Load approved translations from a CSV")
    p_import.add_argument("--lang", required=True)
    p_import.add_argument("--csv", type=Path, required=True)

    args = parser.parse_args()
    if args.command == "export":
        export(args.lang, args.draft, args.out)
    else:
        language_name(args.lang)
        import_csv(args.lang, args.csv)


if __name__ == "__main__":
    main()
