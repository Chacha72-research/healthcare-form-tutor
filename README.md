# AI Healthcare Form Literacy Tutor

A learner sits in a clinic waiting room with a clipboard. The form asks for her *copay*, her *member ID*, her *emergency contact*. She can speak some English, but the words on the page are a wall, so she waits for a family member or a staff person to read it to her.

This app is built for that moment. Adult ESL learners take a photo of a real healthcare form, hear each key term explained in their own language in one plain sentence, and then take a short English quiz to check that the meaning stuck. A spoken practice mode (in progress) lets them rehearse the conversation itself: checking in at the front desk, calling for an appointment, or picking up medicine.

It was made with a local adult school in Fremont, CA, and is designed for beginner learners on their own phones.

## What it does

**1. Photo to plain-language audio.** The learner picks their language once, then photographs a form. The server sends the photo to Claude, which finds the healthcare terms printed on the form and explains each one in the learner's language. Every term and every explanation has a listen button, so learners who read slowly can hear it instead.

**2. Comprehension quiz.** Eight English questions on the words from that form (or any words a teacher chooses). Half ask "which word matches this meaning?" and half are fill-in-the-blank example sentences. Answers are shown as form checkboxes, and every question can be read aloud.

**3. Conversation simulator (beta).** The learner talks out loud with an AI partner playing a receptionist or pharmacist, using the Gemini Live API for real-time voice. The partner speaks slowly, asks one question at a time, and gives a hint in the learner's language if they get stuck twice.

Languages ship as Spanish, Simplified Chinese, and Vietnamese. Adding another is one block in a config file, and right-to-left scripts like Dari or Farsi are supported.

## How the explanations stay accurate

A model that freely explains medical words can be confidently wrong, which is the last thing a beginner needs. So the explainer is grounded in a glossary of 71 plain-English healthcare definitions (`backend/data/glossary.json`) in three ways:

1. **The glossary is the source.** The whole glossary goes into Claude's instructions, and Claude may only restate a term's glossary definition, not add facts, prices, or advice.
2. **It can't invent terms.** Claude answers through a tool whose `term_id` field only accepts glossary ids. The server drops anything else. Words on the form that are not in the glossary are listed under "Ask your teacher," with no definition.
3. **Teacher-approved translations win.** When a teacher approves a translation for a term, the app shows that exact sentence instead of a live computer translation. Unapproved ones are labeled "Computer translation."

The quiz is built straight from the same glossary (no AI call), so it is cheap, instant, and gives the same questions every time for the same seed.

```
Phone                          Python server                         AI
-----                          -------------                         --
photo  ───────────────────────>  /api/explain  ── image + glossary ──> Claude (vision, forced tool)
                                    keeps glossary terms only  <────── term ids + explanations
term cards + audio  <──────────     swaps in approved translations
quiz  <───────────────────────   /api/quiz (built from glossary)
mic audio (16 kHz)  ──────────>  /ws/conversation  ──────────────────> Gemini Live
partner audio + captions <─────     relays audio both ways <────────── (24 kHz audio)
```

## Run it locally

You need Python 3.10+ and Node 20+.

**1. Add your keys.** Copy the example file and fill it in. Only `ANTHROPIC_API_KEY` is required.

```bash
cp .env.example .env
```

Open `.env` and paste your Anthropic key. Add a `GEMINI_API_KEY` if you want the conversation simulator. Never commit `.env`; it is already ignored by git.

**2. Start the Python server.**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**3. Start the React app** in a second terminal.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

### Using it on phones in class

The photo feature works over plain Wi-Fi: run `npm run dev`, then open the "Network" address Vite prints (like `http://192.168.1.20:5173`) on a phone.

The **microphone** is different. Phones only allow mic access on `https://` pages, so the conversation simulator needs either a real deployment or a tunnel such as `cloudflared tunnel --url http://localhost:8000` (after building the app, see below).

### One-server mode (for deployment)

Build the React app once and the Python server will serve it too:

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Everything is then at http://localhost:8000. Any host that can run a Python web server works.

## For teachers

### Measuring before and after a lesson

Give each learner a short code (like `A3`, never a name) and a link:

```
https://your-app/?phase=pre&learner=A3&terms=copay,deductible,member_id,referral,emergency_contact,date_of_birth,prescription,allergies
```

The link opens the quiz directly with those eight words. After the lesson, send the same link with `phase=post`. Then run:

```bash
cd backend
python scripts/comprehension_report.py
```

It prints each learner's before and after scores, the class average, and the words that were still missed most after the lesson. Results are saved in `backend/data/results/`, which is kept out of git.

### Reviewing translations

```bash
cd backend
python scripts/translations.py export --lang es --draft     # writes review_es.csv with AI drafts
# a bilingual teacher fixes the approved_translation column in Excel or Google Sheets
python scripts/translations.py import --lang es --csv review_es.csv
```

Approved sentences are shown to learners word for word from then on.

### Reviewing the glossary

Each entry in `backend/data/glossary.json` has a `vetted` flag that starts as `false`. Read the definition and example, edit anything that does not fit your learners, and flip it to `true`. The tests check that every definition stays one short sentence and never contains the word it defines (otherwise the quiz would give the answer away).

### Adding a language

Copy a block in `backend/data/languages.json`, change the code and names, and translate the `ui` strings. Add a title for each scenario in `scenarios.json`. Set `"dir": "rtl"` for Dari, Farsi, Arabic, or Urdu.

## Privacy

- Photos are held in memory for one request and never saved.
- Claude is told to report only printed labels and to ignore anything a person wrote on the form.
- Quiz results store a short learner code, never a name. The server rejects codes with spaces.
- In the conversation simulator, the AI partner tells learners to use a pretend name and numbers, and never asks for real ID or insurance numbers.
- API keys stay on the server. The browser never sees them, including for Gemini Live, which is relayed through the Python server.

## Project layout

```
backend/
  app/
    main.py           API routes and static file serving
    explain.py        Claude vision call, grounding, approved translations
    quiz.py           quiz builder (meaning + fill-in-the-blank)
    conversation.py   Gemini Live relay for the speaking simulator
    tts.py            optional Google Cloud text-to-speech
    results.py        quiz result logging
  data/
    glossary.json     71 plain-language healthcare terms
    languages.json    learner languages and UI text
    scenarios.json    role-play scenarios
  scripts/            comprehension report, translation review
  tests/              pytest suite (no API calls; Claude and Gemini are faked)
frontend/
  src/screens/        language picker, home, scan, results, quiz, talk
  src/audio/live.ts   mic capture and audio playback for Gemini Live
  public/pcm-recorder-worklet.js   converts mic audio to 16 kHz PCM
```

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

The suite checks the glossary rules, the quiz builder, the API (with a fake Claude client), and the Gemini relay (with a fake Live session), so it runs offline in under a second.

## Status

- Photo explainer and quiz: working.
- Conversation simulator: working end to end with a relay and captions, still being tuned with learners. Turn-taking is walkie-talkie style (the mic mutes while the partner talks), which keeps the partner from hearing itself on phone speakers.
- Model names live in `.env` (`CLAUDE_MODEL`, `GEMINI_LIVE_MODEL`), so they can be updated without code changes.

## License

MIT
