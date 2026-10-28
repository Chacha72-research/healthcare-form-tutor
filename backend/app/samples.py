"""Built-in practice papers: a new patient form, an insurance card, an
Explanation of Benefits, a medical bill, and a Summary of Benefits.

They follow the layout and wording of the real forms, with pretend names and
numbers. Each one is read once at startup with the same word finder used for
uploads, so learners can tap through them with no AI and no waiting.
"""

from __future__ import annotations

import json

from .config import DATA_DIR, REPO_ROOT
from .content import Content
from .forms import TermMatcher, _clean_lines, analyze, extract_pdf_lines


def load_samples(content: Content, matcher: TermMatcher) -> list[dict]:
    data = json.loads((DATA_DIR / "forms.json").read_text(encoding="utf-8"))
    out = []
    for f in data["forms"]:
        item = {k: f[k] for k in ("id", "kind", "icon", "title", "about")}
        if f["kind"] == "card":
            item["terms"] = [
                {"id": t.id, "term": t.term, "confusing": t.confusing}
                for t in (content.terms_by_id[i] for i in f["terms"])
            ]
        else:
            if f["kind"] == "pdf":
                lines = extract_pdf_lines((REPO_ROOT / "frontend" / "public" / f["file"]).read_bytes())
            else:
                lines = _clean_lines(f["lines"])
            item["reading"] = analyze(lines, matcher, content, "text", keep_all_lines=True).to_dict()
        out.append(item)
    return out
