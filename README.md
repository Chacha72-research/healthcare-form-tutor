# AI Healthcare Form Literacy Tutor

A learner sits in a clinic waiting room with a clipboard. The form asks for her *copay*, her *member ID*, her *emergency contact*. She speaks some English, but the words on the page are a wall, so she waits for a family member or a staff member to read it for her. Then, at the front desk, someone asks, "Is this doctor in-network?" and the wall goes up again.

This app is built for both moments. It does three things:

1. **Understand a form.** Upload a real healthcare form. Every health word on it is marked, and the tricky ones (the words learners mix up, like *copay*, *deductible*, and *policyholder*) are bright yellow. Tap any word, in any order, to see what it means in your language, what to write in that spot, and an example.
2. **Quiz the tricky words.** Short questions, easiest first.
3. **Practice speaking.** Say your lines out loud in real situations: checking in, making an appointment, asking for an interpreter, picking up medicine, calling insurance, asking about a bill. The app listens and shows which words came through.

It was made with a local adult school in Fremont, CA, for beginner adult English learners. It runs on **one free API key**.

## How it works

**1. Upload a form.** Any PDF, picture, or text file of a healthcare form, or the built-in sample. Digital PDFs are read right on the server with no AI and no cost. The app finds every word on the form that is in its 73-word healthcare glossary. 40 of those words are flagged as tricky.

**2. Tap a word.** The form appears with its words marked. Tap one and a card opens (beside the form on a laptop, from the bottom on a phone) with:

- the word, its stressed syllable, and an English **Listen** button
- **What it means**, in the learner's language, with a **Listen** button that plays a natural voice
- **What to write here**, the practical part: "Nothing to fill in, this is what you pay at each visit" for *copay*, or "Write the name of the person the insurance is under" for *policyholder*
- an example sentence, in English and the learner's language
- one quick either/or check question
- **Next tricky word**, and a bar that tracks how many tricky words you've opened

Nothing plays by itself. Voice only starts when the learner taps Listen.

**3. Quiz.** Eight questions on the words you opened (or the tricky ones), easiest first: either/or, yes/no, which word matches, fill in the blank.

**4. Practice speaking.** Six situations follow a patient's journey, from easier to harder. Each is a short script:

- The staff member's lines appear and are read aloud in English.
- On your turn, your line is shown with your language underneath. Tap the mic and say it. The app listens (Chrome's speech recognition) and colors each word: green if it came through, underlined red if not. "Hear it" plays the line slowly. "Skip" moves on.
- Finish, and try again with **Hide my lines**: you see only your language and say it in English.
- **Free talk with AI** (optional) is an unscripted role-play with a live AI voice (Gemini Live) playing the receptionist, nurse, pharmacist, insurance agent, or billing clerk. You read from a pretend insurance card.

Languages: **Tamil, Spanish, Simplified Chinese, and Vietnamese**. Adding another is one block in `backend/data/languages.json`.

## Built on adult ESL teaching, not just AI

The explanations, questions, and scripts are fixed teaching content. AI only fills in the learner's language and its voice. The design follows:

- **WIPPEA**, the lesson cycle California adult schools use: warm-up, introduction, presentation, practice, evaluation, application.
- **CASAS competencies** 3.1 to 3.3 (healthcare, insurance, medicine) and **California EL Civics objectives** 28, 29, and 30.
- **The questioning hierarchy** for English learners: pointing first, then either/or, then yes/no, then wh- questions.
- **Concept-checking questions** instead of "Do you understand?"
- **Recasts** in role-play: the partner repeats the learner's idea correctly instead of pointing out the mistake.

[`docs/curriculum.md`](docs/curriculum.md) explains each choice, with sources.

### Keeping explanations accurate

Every explanation comes from the glossary in `backend/data/glossary.json`. Each entry has a one-sentence plain definition, a "what to write here" tip, an example, a pronunciation guide, two check questions, and a tricky flag, and teachers can review it. When the AI writes a meaning in the learner's language, it may only restate that definition. It's told not to add facts, prices, or advice.

Everything the AI writes is saved in `backend/data/generated/<lang>.json`, so each word is written once and every learner sees the same text. A bilingual teacher can review it in a spreadsheet and approve or fix it.

## Get your key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a personal Google account. School accounts sometimes have the free tier turned off.
2. Click **Create API key** and copy it.

This one key powers the learner-language explanations, the voice that reads them, reading pictures of forms, and free talk.

**Free or paid?** The free tier is fine for trying the app, but its daily limits are small (they reset at midnight Pacific), and Google may use free-tier content to improve its products. Turning on billing in AI Studio raises the limits and keeps learners' content out of training. It's cheap because everything is saved after the first time:

| What | Rough cost (Oct 2026 prices) |
| --- | --- |
| A new form: every word explained, plus voice for each one tapped | a few cents, then free every time after |
| All six speaking scripts translated | under 1 cent, then free |
| One 5-minute free talk | about 5 to 10 cents, every time |

English audio and speech recognition use the browser, so they're free. The server window prints a running total each time it makes a new voice clip.

**Without any key**, the app still works for PDF and text forms in English: the clickable form, quizzes, and speaking practice.

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

Open http://localhost:5173 in **Chrome**. Pick **தமிழ்**, tap the first button, then **Use a sample form**. Speaking practice asks for the microphone the first time.

### Preparing a demo

Run this once before a demo, from `backend/` with `.venv` active:

```bash
python scripts/warm_demo.py              # Tamil: every word on the sample form and all six scripts
python scripts/warm_demo.py --lang es    # the same, in Spanish
```

It writes every explanation and translation ahead of time, records the "Listen" clips for each word, and tells you what it cost. After that, the demo and any test runs load instantly and for free. Only free talk uses the API during the demo. Keep the same models and voices in `.env` afterward, because the saved clips are tied to them.

### On phones in class

The form and quiz work over plain Wi-Fi. Run `npm run dev` and open the "Network" address Vite prints on a phone. Speaking practice needs the microphone, and phones only allow that on `https://` pages. For that, build the app (below) and use a deployment or a tunnel such as `cloudflared tunnel --url http://localhost:8000`.

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
    lessons.py       learner-language explanations and scripts, saved for review
    speech.py        learner-language voice with Gemini TTS, cached on disk
    quiz.py          quiz in questioning-hierarchy order
    conversation.py  free-talk relay to Gemini Live
    ai.py            Gemini (default, free) or Claude (optional)
  data/
    glossary.json    73 words: definitions, what to write, pronunciation, checks, tricky flags
    scenarios.json   6 speaking situations with scripts
    languages.json   app text and tutor lines in each language
  scripts/           demo warm-up, key setup, comprehension report, translation review, sample form
  tests/             pytest suite; AI is faked, so it runs offline
frontend/
  src/screens/       Upload, Form (tap a word), Quiz, Practice, Speak
  src/speech.ts      voice: browser for English, Gemini for the learner's language
  src/audio/listen.ts  speech recognition for speaking practice
  src/match.ts       forgiving check of a spoken line against the script
  src/audio/live.ts  microphone and speaker audio for free talk
docs/curriculum.md   the teaching design and its sources
```

## Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

The tests cover form reading, word matching, explanations and caching, the quiz order, the exact requests sent to Gemini and Claude, the voice cache, and the live relay.

## License

MIT
