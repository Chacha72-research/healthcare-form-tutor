"""Builds frontend/public/sample-form.pdf, a blank new-patient form for demos.

It has a real text layer, so the app reads it for free with no AI.

    pip install reportlab
    python scripts/make_sample_form.py
"""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample-form.pdf"

INK = HexColor("#16232A")
SOFT = HexColor("#4A5A61")
RULE = HexColor("#9FB1AC")
TEAL = HexColor("#0D5C57")

SECTIONS = [
    (
        "Patient Information",
        [
            [("Patient Name:", 2.6), ("Date of Birth (DOB):", 1.6)],
            [("Mailing Address:", 4.9)],
            [("Phone Number:", 2.0), ("Preferred Language:", 2.0)],
            [("Marital Status:   [  ] Single   [  ] Married   [  ] Divorced   [  ] Widowed", 0)],
            [("Emergency Contact:", 2.2), ("Relationship to Patient:", 1.4)],
        ],
    ),
    (
        "Insurance Information",
        [
            [("Primary Insurance:", 2.0), ("Policyholder:", 2.2)],
            [("Member ID:", 2.4), ("Group #:", 1.9)],
            [("Secondary Insurance (write N/A if none):", 2.5)],
            [("Your copay is due at check-in. You are responsible for your deductible and coinsurance.", 0)],
        ],
    ),
    (
        "Health History",
        [
            [("Reason for Visit:", 4.8)],
            [("Allergies:", 5.3)],
            [("Current Medications:", 4.5)],
            [("Chronic Conditions:   [  ] Diabetes   [  ] High blood pressure   [  ] Asthma   [  ] Other", 0)],
            [("Primary Care Provider:", 1.9), ("Preferred Pharmacy:", 1.5)],
        ],
    ),
    (
        "Consent and Signature",
        [
            [("I give my consent to treat. I received the Notice of Privacy Practices.", 0)],
            [("Financial Responsibility: I will pay any balance due that my insurance does not pay.", 0)],
            [("Patient Signature:", 2.4), ("Date:", 1.4)],
            [("Parent or Legal Guardian (if patient is under 18):", 2.0)],
        ],
    ),
]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=letter)
    c.setTitle("Sample New Patient Registration Form")
    width, height = letter
    left = 54
    y = height - 60

    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(left, y, "Valley Health Clinic")
    y -= 22
    c.setFillColor(INK)
    c.setFont("Helvetica", 13)
    c.drawString(left, y, "New Patient Registration Form")
    c.setFillColor(SOFT)
    c.setFont("Helvetica-Oblique", 9)
    c.drawRightString(width - left, y, "Sample form for practice only")
    y -= 20

    for title, rows in SECTIONS:
        y -= 14
        c.setFillColor(TEAL)
        c.rect(left, y - 4, width - 2 * left, 20, stroke=0, fill=1)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left + 8, y + 2, title)
        y -= 26
        for row in rows:
            x = left
            for label, line_inches in row:
                c.setFillColor(INK)
                c.setFont("Helvetica", 10.5)
                c.drawString(x, y, label)
                x += c.stringWidth(label, "Helvetica", 10.5) + 6
                if line_inches:
                    end = x + line_inches * 72
                    c.setStrokeColor(RULE)
                    c.line(x, y - 2, end, y - 2)
                    x = end + 18
            y -= 24
    c.showPage()
    c.save()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
