// The learning path: the big picture, then 5 lessons, then a final quiz.
// Each lesson is one page: learn a "how it works" story and 4 key words on
// one side, and practice on the other (a conversation to say out loud, and
// a short quiz).

export interface LessonUnit {
  id: string;
  /** The practice paper the lesson is about */
  paper: string;
  /** The "how it works" story */
  concept: string;
  /** The conversation to practice */
  scenario: string;
  /** Key words. Keep in sync with LESSON_WORDS in backend/scripts/warm_demo.py. */
  words: string[];
  color: string;
}

export const LESSONS: LessonUnit[] = [
  {
    id: "insurance",
    paper: "card",
    concept: "how_insurance_works",
    scenario: "pharmacy",
    words: ["member_id", "group_number", "copay", "premium"],
    color: "teal",
  },
  {
    id: "visit",
    paper: "new_patient",
    concept: "your_rights",
    scenario: "front_desk",
    words: ["policyholder", "relationship_to_patient", "not_applicable", "interpreter"],
    color: "blue",
  },
  {
    id: "eob",
    paper: "eob",
    concept: "who_pays_what",
    scenario: "insurance_call",
    words: ["explanation_of_benefits", "claim", "deductible", "coinsurance"],
    color: "pink",
  },
  {
    id: "bill",
    paper: "bill",
    concept: "paying_bills",
    scenario: "billing",
    words: ["balance_due", "date_of_service", "payment_plan", "guarantor"],
    color: "green",
  },
  {
    id: "care",
    paper: "sbc",
    concept: "where_to_go",
    scenario: "make_appointment",
    words: ["primary_care_provider", "urgent_care", "emergency_room", "in_network"],
    color: "indigo",
  },
];

export const ALL_LESSON_WORDS = LESSONS.flatMap((l) => l.words);

/** The three parts of a lesson; a lesson is finished when all three are. */
export const PARTS = ["learn", "talk", "quiz"] as const;
export type Part = (typeof PARTS)[number];
export const partId = (lesson: string, part: Part) => `${lesson}:${part}`;

export function paperTerms(p: { terms?: { id: string; term: string; confusing: boolean }[]; reading?: { terms: { id: string; term: string; confusing: boolean }[] } }) {
  return p.terms ?? p.reading?.terms ?? [];
}
