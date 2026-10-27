"""Teacher review for the AI-written text in one language.

The app saves everything the AI writes (word meanings and line translations)
in backend/data/generated/<lang>.json. This script turns that into a
spreadsheet a bilingual teacher can check, then loads the fixes back.

1. Export:  python scripts/review_content.py export --lang ta
            (writes review_ta.csv; open it in Excel or Google Sheets)
2. Edit the 'text' column where needed, and put 'yes' in 'approved'.
3. Import:  python scripts/review_content.py import --lang ta --csv review_ta.csv
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
GENERATED = BACKEND / "data" / "generated"
GLOSSARY = BACKEND / "data" / "glossary.json"


def load(lang: str) -> dict:
    path = GENERATED / f"{lang}.json"
    if not path.exists():
        raise SystemExit(f"Nothing generated for '{lang}' yet. Use the app in that language first.")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def export(lang: str, out: Path) -> None:
    data = load(lang)
    terms = {t["id"]: t for t in json.loads(GLOSSARY.read_text(encoding="utf-8"))["terms"]}
    rows = 0
    with out.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig opens cleanly in Excel
        w = csv.writer(f)
        w.writerow(["kind", "key", "english", "text", "approved"])
        for tid, item in sorted(data.get("terms", {}).items()):
            t = terms.get(tid, {})
            w.writerow(["meaning", tid, t.get("definition", ""), item["meaning"], "yes" if item.get("approved") else ""])
            w.writerow(["example", tid, t.get("example", ""), item["example_meaning"], "yes" if item.get("approved") else ""])
            rows += 2
        for english, item in sorted(data.get("lines", {}).items()):
            w.writerow(["line", "", english, item["text"], "yes" if item.get("approved") else ""])
            rows += 1
    print(f"Wrote {out} with {rows} rows.")


def import_csv(lang: str, path: Path) -> None:
    data = load(lang)
    updated = 0
    with path.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            approved = (row.get("approved") or "").strip().lower() in {"yes", "y", "true", "1", "x"}
            text = (row.get("text") or "").strip()
            if not text:
                continue
            if row["kind"] in {"meaning", "example"} and row["key"] in data["terms"]:
                item = data["terms"][row["key"]]
                item["meaning" if row["kind"] == "meaning" else "example_meaning"] = text
                item["approved"] = approved
                updated += 1
            elif row["kind"] == "line" and row["english"] in data["lines"]:
                data["lines"][row["english"]] = {"text": text, "approved": approved}
                updated += 1
    with (GENERATED / f"{lang}.json").open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"Updated {updated} rows in data/generated/{lang}.json. Restart the server to see changes.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p_export = sub.add_parser("export")
    p_export.add_argument("--lang", required=True)
    p_export.add_argument("--out", type=Path)
    p_import = sub.add_parser("import")
    p_import.add_argument("--lang", required=True)
    p_import.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "export":
        export(args.lang, args.out or Path(f"review_{args.lang}.csv"))
    else:
        import_csv(args.lang, args.csv)


if __name__ == "__main__":
    main()
