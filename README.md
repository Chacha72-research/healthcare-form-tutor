# AI Healthcare Form Literacy Tutor

A learner sits in a clinic waiting room with a clipboard. The form asks for her *copay*, her *member ID*, her *emergency contact*. She speaks some English, but the words on the page are a wall, so she waits for a family member or a staff member to read it for her. Then, at the front desk, someone asks, "Is this doctor in-network?" and the wall goes up again.

This app is built for both moments. A learner uploads a real healthcare form and gets a casual voice lesson in their own language that walks through every word on it. Then they practice the actual situations: calling for an appointment, checking in, asking for an interpreter, picking up medicine, calling their insurance, and asking about a bill.

It was made with a local adult school in Fremont, CA, for beginner adult English learners. It runs on **one free API key**.

## How it works

**1. Upload a form.** Any PDF, picture, or text file of a healthcare form, or the built-in sample. Digital PDFs are read right on the server with no AI and no cost. The app finds every word on the form that is in its 73-word healthcare glossary.

**2. Learn the words, by voice.** A tutor talks the learner through the words, 6 at a time, in a chat beside their form. The text on screen follows along with the voice. For each word, the tutor:

- introduces it, and the learner taps it on their own form
- explains it casually in the learner's language
- says it slowly in English, with the stressed syllable marked, so they can repeat it
- shows it in a real sentence
- checks understanding with an either/or question, then a yes/no question

**3. Quiz.** Eight questions, easiest first: either/or, yes/no, which word matches, fill in the blank. Missed words come back at the start of the next lesson.

**4. Practice real situations.** Six situations follow a patient's journey, from easier to harder. Each one has three steps:

- **Listen** to a model conversation, line by line, with the learner's language under each line and useful phrases to borrow.
- **Check** understanding with a few short questions.
- **Talk.** Role-play the situation out loud with a live AI partner (Gemini Live) playing the receptionist, nurse, pharmacist, insurance agent, or billing clerk. The learner reads from a pretend insurance card.

Languages: **Tamil, Spanish, Simplified Chinese, and Vietnamese**. Adding another is one block in `backend/data/languages.json`.

## Built on adult ESL teaching, not just AI

The lesson steps, questions, and conversations are fixed teaching content. AI only fills in the learner's language and the voice. The design follows:

- **WIPPEA**, the lesson cycle California adult schools use: warm-up, introduction, presentation, practice, evaluation, application.
- **CASAS competencies** 3.1 to 3.3 (healthcare, insurance, medicine) and **California EL Civics objectives** 28, 29, and 30.
- **The questioning hierarchy** for English learners: pointing first, then either/or, then yes/no, then wh- questions.
- **Concept-checking questions** instead of "Do you understand?"
- **Recasts** in role-play: the partner repeats the learner's idea correctly instead of pointing out the mistake.

[`docs/curriculum.md`](docs/curriculum.md) explains each choice, with sources.

### Keeping explanations accurate

Every explanation comes from the glossary in `backend/data/glossary.json`. Each entry has a one-sentence plain definition, an example, a pronunciation guide, and two check questions, and teachers can review it. When the AI writes a meaning in the learner's language, it may only restate that definition. It's told not to add facts, prices, or advice.

Everything the AI writes is saved in `backend/data/generated/<lang>.json`, so each word is written once and every learner sees the same text. A bilingual teacher can review it in a spreadsheet and approve or fix it.

## Get your key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a personal Google account. School accounts sometimes have the free tier turned off.
2. Click **Create API key** and copy it.

This one key powers the learner-language lessons, the tutor's voice, reading pictures of forms, and the live conversations.

**Free or paid?** The free tier is fine for trying the app, but its daily limits are small (they reset at midnight Pacific), and Google may use free-tier content to improve its products. Turning on billing in AI Studio raises the limits and keeps learners' content out of training. It's cheap because everything is saved after the first time:

| What | Rough cost (Oct 2026 prices) |
| --- | --- |
| One new lesson (6 words, voice included) | about 5 to 10 cents, then free every time after |
| All six practice situations (text and voice) | about 10 to 15 cents, then free |
| One 5-minute live role-play | about 5 to 10 cents, every time |

The server window prints a running total each time it makes a new voice line.

**Without any key**, the app still works for PDF and text forms in English: lessons, quizzes, and model conversations.

## Run it locally

You need **Python 3.10 or newer** (3.13 recommended) and Node 20+. Macs come with Python 3.9, which is too old: install Python 3.13 from [python.org](https://www.python.org/downloads/) and check with `python3.13 --version`.

**1. Add your key.** From the main project folder, run:

```bash
python3 backend/scripts/set_key.py
```

Paste your key at the prompt (it stays hidden) and press Enter. This creates `.env` with your key in it. Git ignores `.env`, so the key never goes to GitHub. You can also do it by hand: copy `.env.example` to `.env` and paste the key after `GEMINI_API_KEY=`.

**2. Start the Python server.**

```bash
cd backend
python3.13 -m venv .venv         # Windows: py -3.13 -m venv .venv
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

Open http://localhost:5173. Pick **தமிழ்**, tap the first button, then **Use a sample form**.

### Preparing a demo

Run this once before a demo, from `backend/` with `.venv` active:

```bash
python scripts/warm_demo.py            # Tamil: sample form lesson 1 and all six situations
python scripts/warm_demo.py --lessons 5 --lang es   # every sample lesson, in Spanish
```

It makes every lesson line, translation, and voice clip ahead of time and tells you what it cost. After that, the demo and any test runs replay instantly and for free. Only the live Talk step uses the API during the demo. Keep the same models and voices in `.env` afterward, because the saved clips are tied to them.

### On phones in class

Lessons work over plain Wi-Fi. Run `npm run dev` and open the "Network" address Vite prints on a phone. Talking practice needs the microphone, and phones only allow that on `https://` pages. For that, build the app (below) and use a deployment or a tunnel such as `cloudflared tunnel --url http://localhost:8000`.

### One-server mode

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Everything is then served from http://localhost:8000.

## For teachers

**Measure before and after a lesson.** Give each learner a short code (like `A3`, never a name) and a link:

```
https://your-app/?phase=pre&learner=A3&terms=copay,deductible,member_id,referral,in_network,prior_authorization
```

Send the same link with `phase=post` after the lesson, then run `python scripts/comprehension_report.py` in `backend/`. It prints each learner's before and after scores, the class average, and the words still missed most.

**Review the computer translations.**

```bash
cd backend
python scripts/review_content.py export --lang ta      # writes review_ta.csv
# fix the 'text' column in Excel or Google Sheets, put 'yes' under 'approved'
python scripts/review_content.py import --lang ta --csv review_ta.csv
```

**Change the content.** Words, situations, and all app text live in `backend/data/` as JSON. The tests check that every definition stays one short sentence, every check question avoids the word it's checking, and every language has every string.

## Privacy

- Uploaded forms are held in memory for one request and never saved. Digital PDFs never leave the server.
- For pictures, the AI is told to copy only printed labels, never anything someone wrote on the form. Requests are sent with `store=False`.
- Quiz results store a short learner code, never a name.
- In practice situations, learners use a pretend patient and a pretend insurance card. The AI partner never asks for real information.
- The API key stays on the server, including for live audio, which is relayed through the Python server.

## Project layout

```
backend/
  app/
    main.py          API routes
    forms.py         reads uploads; finds glossary words (no AI for digital PDFs)
    lessons.py       learner-language lesson text, saved for review
    speech.py        tutor voice with Gemini TTS, cached on disk
    quiz.py          quiz in questioning-hierarchy order
    conversation.py  live role-play relay to Gemini Live
    ai.py            Gemini (default, free) or Claude (optional)
  data/
    glossary.json    73 words: definitions, pronunciation, check questions, CASAS codes
    scenarios.json   6 practice situations with model conversations
    languages.json   app text and tutor lines in each language
  scripts/           demo warm-up, key setup, comprehension report, translation review, sample form
  tests/             pytest suite; AI is faked, so it runs offline
frontend/
  src/screens/       Upload, Lesson, Quiz, Practice, Scenario
  src/speech.ts      voice playback with prefetching and phone-voice fallback
  src/audio/live.ts  microphone and speaker audio for live practice
docs/curriculum.md   the teaching design and its sources
```

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

The tests cover form reading, word matching, lessons and caching, the quiz order, the exact requests sent to Gemini and Claude, the voice cache, and the live relay.

## License

MIT
