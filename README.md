# AI Healthcare Form Literacy Tutor

A learner sits in a clinic waiting room with a clipboard. The form asks for her *copay*, her *member ID*, her *emergency contact*. She speaks some English, but the words on the page are a wall, so she waits for a family member or a staff member to read it for her. Then, at the front desk, someone asks, "Is this doctor in-network?" and the wall goes up again.

This app is built for both moments. It is made for adults who are just starting English, including people who have rarely used a computer, so it works like a beginner's language-learning app: one page, one big button at a time, and a friendly guide.

## How it works

Right after picking a language, learners see **the big picture**: how one doctor visit moves between **You**, the **Clinic**, and **Insurance**, one step at a time. An arrow lights up for each step, and a little paper (like $, CLAIM, EOB, or BILL) travels along it. Each step has one easy English sentence, read aloud, and the full explanation in the learner's language. It ends with the whole flowchart, and it stays at the top of the path to revisit.

Then they land on **one learning path**: a winding line of big round buttons. Every button can be tapped, and the next one to try bounces. **Clip**, a paperclip, gives every instruction in the learner's language with simple English underneath, and a speaker button reads it aloud.

The path goes through five real kinds of paper, in the order a patient meets them, and each one is tagged with its step in the big picture:

1. **Insurance card**
2. **New patient form**
3. **Explanation of Benefits** ("THIS IS NOT A BILL")
4. **Medical bill**
5. **Summary of Benefits and Coverage**, the standard form every US health plan must give

They follow the layout and wording of the real forms, with pretend names and numbers (Sam Lee, Golden Valley Health Plan). Each paper has three kinds of buttons:

- **Look at it.** The paper with its health words marked. Tricky words are bright yellow. Tap any word, in any order, and a card shows the English word split into sounds (co · PAY) with Listen and Slow buttons, what it means, what to write in that spot, and an example. English comes first and every sentence can be tapped to hear it. The learner's language sits underneath as the helper.
- **How it works.** A short story of 4 cards, like "You pay a premium every month" or "The EOB is not a bill." Each card has one short English sentence (about 4th grade level) that is read aloud, and a fuller adult explanation in the learner's language. Two easy questions follow. Topics: your rights at the clinic, how insurance works, who pays what, what to do with a bill, and where to go for care.
- **Word lessons** of about 3 words, one small task per screen: meet the word, say it into the mic, find it on the paper, pick the word you hear, answer an either/or question, fill in a sentence, and match a "what to write" tip. A wrong answer comes back once at the end. Nothing is lost, and the lesson ends with confetti.

After the papers come **Talk at the clinic** (six speaking scripts: you say your lines into the mic, the app checks which words came through, then you can try again with your lines hidden, or try free talk with a live AI voice) and **Quiz** (one per paper, plus one with all the words).

**The voice orb.** Whenever the app is listening, a soft orb glows and grows with the learner's voice, so a nervous speaker can see that the app hears them. In free talk it turns purple and pulses while the AI is talking.

**Voice.** English uses the browser's own voice, so it's instant and free. Only the learner's language uses Gemini's voice, and only when the learner taps a speaker. Speech recognition is Chrome's.

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

Open http://localhost:5173 in **Chrome** and pick **தமிழ்**. The path opens right away. Speaking practice asks for the microphone the first time.

### Preparing a demo

Run this once before a demo, from `backend/` with `.venv` active:

```bash
python scripts/warm_demo.py              # Tamil: every paper, story, and script
python scripts/warm_demo.py --lang es    # the same, in Spanish
```

It writes every explanation, story, and translation ahead of time, records the "Listen" clips (word meanings, tips, story cards, and Clip's instructions), and tells you what it cost. After that, the demo and any test runs load instantly and for free. Only free talk uses the API during the demo. Keep the same models and voices in `.env` afterward, because the saved clips are tied to them.

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

- The practice papers use pretend names and numbers. The upload API (for teachers) holds a file in memory for one request and never saves it.
- For pictures, the AI is told to copy only printed labels, never anything someone wrote on the form. Requests are sent with `store=False`.
- Quiz results store a short learner code, never a name.
- In practice situations, learners use a pretend patient and a pretend insurance card. The AI partner never asks for real information.
- The API key stays on the server, including for live audio, which is relayed through the Python server.

## Project layout

```
backend/
  app/
    main.py          API routes
    forms.py         reads forms; finds glossary words (no AI for digital PDFs)
    samples.py       loads the practice papers
    concepts.py      the "how it works" stories
    lessons.py       learner-language explanations and scripts, saved for review
    speech.py        learner-language voice with Gemini TTS, cached on disk
    quiz.py          quiz in questioning-hierarchy order
    conversation.py  free-talk relay to Gemini Live
    ai.py            Gemini (default, free) or Claude (optional)
  data/
    glossary.json    77 words: definitions, what to write, pronunciation, checks, tricky flags
    scenarios.json   6 speaking situations with scripts
    forms.json       the 5 practice papers
    concepts.json    5 "how it works" stories
    languages.json   app text and tutor lines in each language
  scripts/           demo warm-up, key setup, comprehension report, translation review, sample form
  tests/             pytest suite; AI is faked, so it runs offline
frontend/
  src/screens/       Path (the one learning page), Explore, Story, Lesson, Quiz, Speak
  src/path.ts        builds the path from the papers, stories, and scripts
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
