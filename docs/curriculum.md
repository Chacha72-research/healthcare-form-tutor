# How the app teaches

This app is built to work the way adult ESL teachers in California already teach. It doesn't let an AI explain words however it likes. The lesson steps, the questions, and the practice situations are fixed teaching content. AI only fills in the learner's language (and a voice), and every word it explains is tied to a teacher-reviewable glossary entry.

## Who it's for

Adult English learners at roughly **ELPS level 1 to 2**. At level 1, learners "respond to simple yes/no questions and some wh-questions," "participate in short conversations and written exchanges about familiar topics and in familiar contexts," and "use a narrow range of vocabulary" ([ELP Standards for Adult Education, 2016](https://air.org/sites/default/files/2026-08/elp-standards-adult-ed-October-2016.pdf)). That is why every question in the app is either/or, yes/no, or a short wh- question, and why a lesson covers 6 words at a time.

## What it covers

The content is **situational and competency-based**. It is built around real healthcare tasks, not word lists.

| What learners practice | CASAS competency | CA EL Civics objective |
| --- | --- | --- |
| Making appointments by phone | 3.1.2 Identify information necessary to make or keep medical and dental appointments | 28 Accessing Health Care |
| Checking in, talking with front desk staff | 3.1.3 Identify and use health care services and facilities, including interacting with staff | 28 Accessing Health Care |
| Personal information on intake forms | 0.2.1, 0.2.2 Complete a personal information form; 3.2.1 Fill out medical health history forms | 28 Accessing Health Care |
| Asking for an interpreter, asking someone to repeat | 3.1.7 Patient rights; 0.1.6 Clarify or request clarification | 28 Accessing Health Care |
| Insurance: in-network, referral, prior authorization, deductible | 3.1.6 Interpret information about health care plans, insurance, and benefits; 3.2.3 Interpret forms associated with health insurance | 29 Health Insurance Coverage/Issues |
| Bills: EOB, balance due, payment plans | 3.2.4 Interpret medical bills | 29 Health Insurance Coverage/Issues |
| Pharmacy: prescriptions, dosage, side effects, refills, generics | 3.3.1, 3.3.2, 3.3.4 Medications and medicine labels | 30 Using Pharmacies/Medication |

Sources: [CASAS Competencies](https://files.eric.ed.gov/fulltext/ED505259.pdf), [California EL Civics health objectives (OTAN)](https://elcivics.otan.us/PublicMaterial/HealthHome).

Each glossary entry in `backend/data/glossary.json` lists the CASAS competencies it supports, so a teacher can line lessons up with their EL Civics plan.

### Why these six situations

Research with immigrants who have limited English found the hardest moments were phone calls (scheduling and refills), getting an interpreter, and insurance notices (Joseph & Martinez, 2025, [*Language Barriers and Healthcare Challenges for Immigrants with Limited English Proficiency After Health Reform*](https://pmc.ncbi.nlm.nih.gov/articles/PMC12840673)). The practice situations follow a patient's journey through exactly those moments, easiest first:

1. Call to make an appointment
2. Check in at the front desk
3. Ask for an interpreter
4. Pick up medicine at the pharmacy
5. Call your insurance
6. Ask about a bill

The interpreter situation teaches a right, not just words. Federal law requires health programs that receive federal funds to provide language help free of charge, under Title VI of the Civil Rights Act and Section 1557 of the Affordable Care Act ([HHS Office for Civil Rights](https://www.hhs.gov/civil-rights/for-individuals/special-topics/limited-english-proficiency/index.html)).

## The lesson cycle

Lessons follow **WIPPEA**, the lesson plan model California's adult education technology project (OTAN) teaches: Warm-up, Introduction, Presentation, Practice, Evaluation, Application ([OTAN](https://otan.us/Resources/TeachingWithTechnology/LessonPlan)).

| WIPPEA stage | In the app |
| --- | --- |
| **Warm-up** | The tutor greets the learner and reviews one word from a past lesson, picking a word they missed first. |
| **Introduction** | The tutor says how many words they'll learn and why: "After this, you can read this part of the form on your own." |
| **Presentation** | For each word: the tutor introduces it, the learner **finds it on their own form**, the tutor explains it in their language, models the English pronunciation (with the stressed syllable marked), and shows it in a real sentence. |
| **Practice** | Concept checks for every word, then an 8-question quiz. |
| **Evaluation** | The quiz score, plus a list of words to review. Missed words come back in the next warm-up. |
| **Application** | A practice situation: listen to a model conversation, check understanding, then role-play it out loud. |

### Using the learner's own form

The form the learner uploads is used as **realia**, an authentic material from their own life. The tutor asks them to find each word on the form before explaining it. That is the easiest kind of response there is: pointing, with no speaking yet.

### Questions go from easiest to hardest

Every set of questions follows the **questioning hierarchy** for English learners. It starts with pointing, then either/or choice questions, then yes/no, then wh- questions ([MCPS ESOL, *Questioning Strategies for English Language Learners*](https://www.montgomeryschoolsmd.org/siteassets/district/curriculum/esol/cpd/module5/docs/questioning.pdf)):

- **In a lesson:** find it on your form, then an either/or check, then a yes/no check.
- **In the quiz:** either/or, then yes/no, then "which word matches," then fill in the blank.
- **In a practice situation:** either/or, then yes/no, then wh- questions about the conversation.

### Concept-checking questions, not "Do you understand?"

Learners often feel they have to say "yes" to "Do you understand?", so it shows nothing ([BusyTeacher](https://m.busyteacher.org/18236-how-to-check-comprehension-6-tips.html)). Each glossary word has two short concept-checking questions that test the meaning without using the word itself. For "copay":

- "Do you pay it every visit or once a year?"
- "Is it a set amount, like $20?"

A test (`test_check_questions_follow_ccq_rules`) makes sure no check question says the word it is checking.

### Language support

- **Meaning goes in the learner's language.** The words they need to read and say stay in English, and the English term is kept inside the explanation, so they connect the sound to the written word.
- **The tutor is casual and warm.** For Tamil, it uses everyday spoken Tamil with respectful forms (நீங்க), not formal written Tamil.
- **Everything has audio.** The tutor speaks in the learner's language, and English is modeled slowly for repeating. Every screen shows the learner's language with small English underneath.

### Role-play

The live partner (Gemini Live) is told to act like a patient ESL teacher, not a chatbot:

- It explains the situation in one sentence of the learner's language, then switches to English.
- It speaks in short sentences, asks one question at a time, and waits through long pauses.
- It corrects by **recasting**: it repeats the learner's idea back correctly instead of pointing out the mistake (Lyster & Ranta, 1997).
- If the learner is stuck twice, it gives one hint in their language.
- It ends with one thing they did well and one word to practice.

Learners play a pretend patient, Sam Lee, and read from a pretend insurance card. They practice the real task without ever sharing real information.

## What teachers can change

- **`backend/data/glossary.json`**: the words, their plain definitions, pronunciation, check questions, and CASAS codes. Set `vetted` to true after review.
- **`backend/data/scenarios.json`**: the six situations, their model conversations, and their questions.
- **`backend/data/languages.json`**: all app text, including the tutor's lines, in every language.
- **`backend/data/generated/<lang>.json`**: what the AI wrote in each language. Review it with `python scripts/review_content.py export --lang ta`, fix anything, and import it back. Approved text is used word for word, and approved word meanings drop the "Computer translation" label.
