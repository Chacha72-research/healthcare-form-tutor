"""Reads an uploaded form and finds the glossary words on it.

Digital PDFs and text files are read right here with no AI at all, so the
common case is free and the file never leaves the server. Only pictures and
scanned PDFs (no text layer) need the AI, and then only to copy the printed
labels; deciding which glossary words are present always happens here.
"""

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field

from .ai import AIProvider, FilePart
from .content import Content, Term

log = logging.getLogger(__name__)

PDF = "application/pdf"
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
TEXT_TYPES = {"text/plain"}
MAX_PDF_PAGES = 10
MAX_LINES = 400
MIN_LETTERS = 40  # fewer than this in a PDF means it is probably a scan

READ_LABELS_SYSTEM = (
    "You copy printed text from photos and scans of U.S. healthcare forms. "
    "Copy only what is PRINTED on the form: labels, headings, and instructions. "
    "Never copy anything a person wrote or typed into the form, such as names, dates, numbers, "
    "addresses, signatures, or check marks."
)
READ_LABELS_PROMPT = (
    "List every printed label, heading, and instruction on this form in reading order, "
    "one per item, copied exactly. If this is not a form or it is too blurry to read, "
    "set readable to false and return an empty list."
)
READ_LABELS_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {"type": "boolean"},
        "labels": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["readable", "labels"],
}


class FormError(Exception):
    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


@dataclass
class Mark:
    start: int
    end: int
    term_id: str


@dataclass
class FormLine:
    text: str
    marks: list[Mark] = field(default_factory=list)


@dataclass
class FormReading:
    source: str  # "text" (read locally) or "ai"
    lines: list[FormLine]
    terms: list[dict]
    unlisted: list[str]

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "lines": [
                {"text": ln.text, "marks": [{"start": m.start, "end": m.end, "term_id": m.term_id} for m in ln.marks]}
                for ln in self.lines
            ],
            "terms": self.terms,
            "unlisted": self.unlisted,
        }


def _is_abbreviation(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return len(text) <= 5 and bool(letters) and all(c.isupper() for c in letters)


class TermMatcher:
    """Finds glossary terms and their other forms in a line of text."""

    def __init__(self, terms: list[Term]):
        self.patterns: list[tuple[re.Pattern[str], str]] = []
        for term in terms:
            for text in {term.term, *term.aliases}:
                flags = 0 if _is_abbreviation(text) else re.IGNORECASE
                body = re.escape(text).replace(r"\ ", r"\s+").replace(r"\-", r"[-\s]?")
                pattern = re.compile(r"(?<![A-Za-z0-9])" + body + r"(?![A-Za-z0-9])", flags)
                self.patterns.append((pattern, term.id))

    def find(self, text: str) -> list[Mark]:
        found: list[Mark] = []
        for pattern, term_id in self.patterns:
            for m in pattern.finditer(text):
                found.append(Mark(m.start(), m.end(), term_id))
        # Prefer longer matches ("Medical record number" over "Medical"), then earlier ones.
        found.sort(key=lambda mk: (-(mk.end - mk.start), mk.start))
        chosen: list[Mark] = []
        for mk in found:
            if all(mk.end <= c.start or mk.start >= c.end for c in chosen):
                chosen.append(mk)
        return sorted(chosen, key=lambda mk: mk.start)


def _clean_lines(raw: list[str]) -> list[str]:
    lines = []
    for line in raw:
        line = re.sub(r"[_.]{4,}", " ____ ", line)  # blank lines to fill in
        line = re.sub(r"\s+", " ", line).strip()
        if line and any(c.isalpha() for c in line):
            lines.append(line[:160])
        if len(lines) >= MAX_LINES:
            break
    return lines


def extract_pdf_lines(data: bytes) -> list[str]:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            reader.decrypt("")
        text = "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PDF_PAGES])
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        log.info("Could not read PDF: %s", exc)
        raise FormError("unreadable") from exc
    return _clean_lines(text.splitlines())


def _label_candidates(line: str) -> list[str]:
    """Short printed labels like 'Employer:' that are not in the glossary."""
    out = []
    for chunk in re.findall(r"([A-Za-z][A-Za-z /&'()-]{2,40}):", line):
        chunk = chunk.strip()
        if 1 <= len(chunk.split()) <= 4:
            out.append(chunk)
    return out


def analyze(
    lines: list[str], matcher: TermMatcher, content: Content, source: str, *, keep_all_lines: bool = False
) -> FormReading:
    shown: list[FormLine] = []
    terms: list[dict] = []
    seen: set[str] = set()
    unlisted: list[str] = []

    for text in lines:
        marks = matcher.find(text)
        if marks or keep_all_lines:
            shown.append(FormLine(text=text, marks=marks))
            for mk in marks:
                if mk.term_id not in seen:
                    seen.add(mk.term_id)
                    term = content.terms_by_id[mk.term_id]
                    terms.append(
                        {
                            "id": term.id,
                            "term": term.term,
                            "form_text": text[mk.start : mk.end],
                            "confusing": term.confusing,
                        }
                    )
        for label in _label_candidates(text):
            if not matcher.find(label) and label not in unlisted and len(unlisted) < 6:
                unlisted.append(label)

    return FormReading(source=source, lines=shown, terms=terms, unlisted=unlisted)


async def read_form(
    data: bytes,
    mime_type: str,
    *,
    matcher: TermMatcher,
    content: Content,
    ai: AIProvider | None,
) -> FormReading:
    if not data:
        raise FormError("unreadable")

    if mime_type == PDF:
        lines = extract_pdf_lines(data)
        if sum(c.isalpha() for c in " ".join(lines)) >= MIN_LETTERS:
            return analyze(lines, matcher, content, "text")
        # No text layer: it's a scan, so treat it like a picture.
    elif mime_type in TEXT_TYPES:
        text = data.decode("utf-8", errors="replace")
        return analyze(_clean_lines(text.splitlines()), matcher, content, "text")
    elif mime_type not in IMAGE_TYPES:
        raise FormError("unsupported", 415)

    if ai is None:
        raise FormError("picture_needs_ai", 422)

    result = await ai.generate_json(
        system=READ_LABELS_SYSTEM,
        prompt=READ_LABELS_PROMPT,
        schema=READ_LABELS_SCHEMA,
        files=[FilePart(data=data, mime_type=mime_type)],
    )
    if not result.get("readable", True):
        raise FormError("unreadable")
    labels = [str(x) for x in result.get("labels") or [] if str(x).strip()]
    return analyze(_clean_lines(labels), matcher, content, "ai")
