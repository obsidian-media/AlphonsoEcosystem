// Phone phase 4 test round (throwaway, spike/phone-phase4): the 20 questions put to the iPhone's
// own model, to free cloud models from the phone and to llama3.2:3b on the computer. Every prompt
// is built from the agents' real code, so the test measures what the phone would really be asked.
// Design: docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md
import { joseDecisionPrompt } from '../../services/jose/joseDecision';
import { ALPHONSO_ANSWER_PROMPT } from '../../services/alphonso/answerPrompt';
import { decisionLine } from '../../services/echo/recall';
import type { Decision, DecisionKind } from '../../services/echo/decisions';

export type SpikeAgent = 'jose' | 'alphonso' | 'echo';

export interface SpikeQuestion {
  id: string;
  agent: SpikeAgent;
  system: string;
  prompt: string;
  /** Jose only: the user's message inside his decision prompt. */
  message?: string;
  expect: { route?: 'direct' | 'plan'; contains?: string[]; mentionsJose?: boolean };
}

// Jose: messages the word rules leave to his model (the test checks ruleRoute() returns null).
const JOSE: Array<[string, 'direct' | 'plan']> = [
  ['thanks, that was really helpful', 'direct'],
  ['good morning! long day ahead', 'direct'],
  ['give me three names for a golden retriever puppy', 'direct'],
  ['quick one: is it "affect" or "effect" in "the change will affect sales"', 'direct'],
  ['I feel a bit stuck on what to post this week', 'direct'],
  ['post our new opening hours on Slack', 'plan'],
  ['fix the failing test in my shop project', 'plan'],
  ['send Sam the meeting notes from today', 'plan'],
  ['add a dark mode to my blog app', 'plan'],
  ['check the landing page copy for mistakes before it goes live', 'plan'],
];

// Alphonso: answers and everyday writing, with his real prompt.
const ALPHONSO: Array<[string, SpikeQuestion['expect']]> = [
  ['What is the difference between a latte and a flat white?', { contains: ['milk'] }],
  ['How many minutes is 2.5 hours?', { contains: ['150'] }],
  ['Write a short, friendly email to Sam saying the meeting moves from Tuesday to Thursday at 3pm.', { contains: ['Thursday'] }],
  ['Write an Instagram caption for a bakery\'s new cinnamon bun, under 30 words, with two hashtags.', { contains: ['#'] }],
  ['Summarise in two sentences: our shop had its best month in March, mostly from online orders, while walk-in sales fell slightly.', { contains: ['online'] }],
  ['Change the price of the blue mug in my shop project to 18 dollars.', { mentionsJose: true }],
];

const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
function decision(id: string, kind: DecisionKind, text: string, iso: string, why?: string): Decision {
  return { id, kind, text, why, topics: [], source: { surface: 'chat', by: 'echo' }, atMs: day(iso), status: 'active' };
}

// Echo: recall from a few saved decisions (made up), in the phone's real line format.
const ECHO: Array<{ decisions: Decision[]; question: string; contains: string[] }> = [
  {
    decisions: [
      decision('d1', 'decision', 'The spring launch is on Friday 14 March', '2026-10-20', 'the printer needs two weeks'),
      decision('d2', 'preference', 'Emails are signed "Best, Sam"', '2026-10-12'),
      decision('d3', 'decision', 'The newsletter goes out on Mondays', '2026-09-30'),
    ],
    question: 'When is the spring launch, and why that date?',
    contains: ['14', 'March', 'printer'],
  },
  {
    decisions: [
      decision('d4', 'decision', 'The team offsite is in Montreal', '2026-10-01'),
      decision('d5', 'rejection', 'Toronto for the offsite', '2026-09-28', 'too expensive in October'),
      decision('d6', 'preference', 'Posts use British spelling', '2026-08-15'),
      decision('d7', 'decision', 'Budget for the offsite is 4,000 dollars', '2026-10-02'),
    ],
    question: 'Where is the offsite and what is the budget?',
    contains: ['Montreal', '000'],
  },
  {
    decisions: [
      decision('d8', 'instruction', 'Never post on Sundays', '2026-10-05'),
      decision('d9', 'decision', 'Instagram posts go out at 6pm', '2026-10-06'),
      decision('d10', 'preference', 'Captions stay under 30 words', '2026-10-07'),
    ],
    question: 'What time do Instagram posts go out, and is there a day we skip?',
    contains: ['6', 'Sunday'],
  },
  {
    decisions: [
      decision('d11', 'rejection', 'The green logo', '2026-10-10', 'it looked like a bank'),
      decision('d12', 'decision', 'The logo is navy with a gold star', '2026-10-11'),
      decision('d13', 'decision', 'The shop opens at 9am on weekdays', '2026-09-01'),
      decision('d14', 'preference', 'Short answers, no bullet lists', '2026-08-01'),
      decision('d15', 'decision', 'Prices include tax', '2026-07-15'),
    ],
    question: 'Which logo did we pick, and why not the green one?',
    contains: ['navy', 'bank'],
  },
];

export const PHASE4_QUESTIONS: SpikeQuestion[] = [
  ...JOSE.map(([message, route], i): SpikeQuestion => ({
    id: `jose-${i + 1}`, agent: 'jose', system: '', prompt: joseDecisionPrompt(message), message, expect: { route },
  })),
  ...ALPHONSO.map(([prompt, expect], i): SpikeQuestion => ({
    id: `alphonso-${i + 1}`, agent: 'alphonso', system: ALPHONSO_ANSWER_PROMPT, prompt, expect,
  })),
  ...ECHO.map(({ decisions, question, contains }, i): SpikeQuestion => ({
    id: `echo-${i + 1}`,
    agent: 'echo',
    system: ALPHONSO_ANSWER_PROMPT,
    prompt: `Decisions you saved:\n${decisions.map(decisionLine).join('\n')}\n\n${question}`,
    expect: { contains },
  })),
];
