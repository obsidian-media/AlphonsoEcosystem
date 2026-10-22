// What each agent is asked in a content-factory step, and how its answer is
// checked. A reply that does not match is refused (null): the step then fails
// and says so, it is never filled in with stock text.
import { extractJsonObject } from '../../lib/jsonUtils.js';
import type { ContentStepPayload, StepId } from './contentTypes';

type Json = Record<string, unknown>;

const HONEST_COPY = [
  'Honest copy: say content is AI-generated when it is.',
  'Never invent numbers, ratings, users, quotes or results.',
  'No claims the brand cannot back up.',
].join(' ');

/** What each action asks for, and the JSON keys it must return. */
const ACTIONS: Record<string, { role: string; ask: string; keys: string; uses: StepId[] }> = {
  research_virality: {
    role: 'Hector, Alphonso\'s research agent',
    ask: 'Research what goes viral now for this idea on these platforms: find at least 3 reference posts that did well, say why each works and quote its hook, then pull out the patterns and suggest hook ideas.',
    keys: '{"references":[{"title":"","url":"","whyItWorks":"","hook":""}],"patterns":[""],"hookIdeas":[""]} (at least 3 of each)',
    uses: [],
  },
  analysis_market: {
    role: 'Nova, Alphonso\'s opportunity analyst',
    ask: 'Check the market: who already makes this kind of content, what they do, which gaps are open, how big the opportunity is (0-100) and which angle to take.',
    keys: '{"competitors":[{"name":"","whatTheyDo":""}],"gaps":[""],"opportunityScore":0,"angle":""}',
    uses: [],
  },
  creative_script: {
    role: 'Miya, Alphonso\'s creative director',
    ask: 'Write exactly 3 hook options based on the research, choose the best, and write the timed script. Each part has start and end seconds, the spoken words, the on-screen text, B-roll notes and a music cue.',
    keys: '{"hooks":["","",""],"chosenHook":0,"title":"","script":[{"startSec":0,"endSec":0,"spoken":"","onScreenText":"","bRoll":"","music":""}]}',
    uses: ['research'],
  },
  analysis_content_review: {
    role: 'Nova, Alphonso\'s opportunity analyst',
    ask: 'Review the hook and the script against the research and the market: score each 1-10, give notes, and list what must be fixed before it goes further.',
    keys: '{"hookScore":0,"scriptScore":0,"notes":[""],"mustFix":[""]}',
    uses: ['research', 'script'],
  },
  audit_content_quality: {
    role: 'Maria, Alphonso\'s quality and governance agent',
    ask: 'Score each piece 1-10 side by side with the brand\'s reference posts (say which one you compared it to), list its weak points, and list any honesty problems. Be strict: a 7 means it could sit next to the references.',
    keys: '{"pieces":[{"pieceId":"","score":0,"comparedTo":"","weakPoints":[""]}],"honestyIssues":[""]}',
    uses: ['research', 'script', 'scenes', 'thumbnail', 'campaign'],
  },
  creative_scenes: {
    role: 'Miya, Alphonso\'s creative director',
    ask: 'Turn the script into a storyboard: one scene per script part, with the camera angle, the movement, and an image prompt. Give one shared style so every scene has the same look.',
    keys: '{"style":"","scenes":[{"id":"s1","startSec":0,"endSec":0,"description":"","camera":"","movement":"","imagePrompt":"","negativePrompt":""}]}',
    uses: ['script'],
  },
  creative_thumbnails: {
    role: 'Miya, Alphonso\'s creative director',
    ask: 'Design exactly 3 thumbnail concepts: a headline of at most 6 words, an image prompt for the picture (no text in the picture), and which side the headline goes on.',
    keys: '{"concepts":[{"id":"t1","headline":"","imagePrompt":"","layout":"left|right|center"}]}',
    uses: ['research', 'script'],
  },
  creative_campaign: {
    role: 'Miya, Alphonso\'s creative director',
    ask: 'Write the campaign: for each platform a caption, hashtags and a description within that platform\'s limits; ad copy for Meta, Google and YouTube; and suggested publishing dates.',
    keys: '{"platforms":[{"platform":"","caption":"","hashtags":[""],"description":""}],"ads":[{"network":"meta|google|youtube","headline":"","body":""}],"calendar":[{"platform":"","suggestedAt":"","reason":""}]}',
    uses: ['research', 'script', 'thumbnail'],
  },
  strategy_posting_times: {
    role: 'Nova, Alphonso\'s opportunity analyst',
    ask: 'Suggest when to post on each platform for this audience, with a reason from the research.',
    keys: '{"times":[{"platform":"","dayOfWeek":"","time":"","reason":""}]}',
    uses: ['research'],
  },
  security_content_check: {
    role: 'Sentinel, Alphonso\'s security agent',
    ask: 'Check the campaign text and links for anything risky: personal data, unsafe links, false claims or anything that breaks platform rules.',
    keys: '{"ok":true,"issues":[""]}',
    uses: ['campaign'],
  },
};

function brandText(payload: ContentStepPayload): string {
  const b = payload.brand;
  const lines = [
    `Brand: ${b.name}`,
    b.tone && `Tone: ${b.tone}`,
    b.audience && `Audience: ${b.audience}`,
    b.visualStyle && `Visual style: ${b.visualStyle}`,
    b.characterRefs && `Characters: ${b.characterRefs}`,
    b.palette.length > 0 && `Palette: ${b.palette.join(', ')}`,
    b.honestyRules && `Brand rules: ${b.honestyRules}`,
  ].filter(Boolean);
  if (b.references.length > 0) {
    lines.push('Reference posts:', ...b.references.map((r) => `- ${r.url}${r.note ? ` (${r.note})` : ''}`));
  }
  const lessons = b.lessons.slice(-10);
  if (lessons.length > 0) lines.push('Lessons from earlier feedback:', ...lessons.map((l) => `- ${l.text}`));
  return lines.join('\n');
}

export function buildStepPrompt(payload: ContentStepPayload, agent: string, actionType: string): { system: string; prompt: string } {
  const action = ACTIONS[actionType];
  const brief = payload.brief;
  const system = `You are ${action?.role || agent}. ${HONEST_COPY} Return JSON only, with exactly these keys: ${action?.keys || '{}'}`;
  const parts = [
    action?.ask || payload.task,
    payload.task && payload.task !== action?.ask ? `Instruction: ${payload.task}` : '',
    `Idea: ${brief.idea}`,
    `Format: ${brief.format}. Length: about ${brief.lengthSec} seconds. Platforms: ${brief.platforms.join(', ') || 'not chosen'}. Outputs: ${brief.outputs.join(', ') || 'not chosen'}.`,
    brief.notes ? `Notes: ${brief.notes}` : '',
    brandText(payload),
  ];
  for (const step of action?.uses || []) {
    if (payload.prior[step] !== undefined) parts.push(`${step} (earlier step):\n${JSON.stringify(payload.prior[step]).slice(0, 8000)}`);
  }
  if (actionType === 'creative_script' && brief.writeInMyVoice && payload.brand.pastScripts) {
    parts.push(`Write in this voice (the brand's past scripts):\n${payload.brand.pastScripts.slice(0, 6000)}`);
  }
  parts.push(`Return JSON only: ${action?.keys || '{}'}`);
  return { system, prompt: parts.filter(Boolean).join('\n\n') };
}

const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown, min = -Infinity, max = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const list = (v: unknown, min = 0): v is Json[] => Array.isArray(v) && v.length >= min;
const texts = (v: unknown, min = 0) => Array.isArray(v) && v.length >= min && v.every(isText);
const every = (v: unknown, min: number, check: (item: Json) => boolean) => list(v, min) && v.every((item) => item && typeof item === 'object' && check(item));
const words = (v: unknown) => String(v || '').trim().split(/\s+/).filter(Boolean).length;

const VALIDATORS: Record<string, (j: Json) => boolean> = {
  research_virality: (j) => every(j.references, 3, (r) => isText(r.title) && isText(r.whyItWorks) && isText(r.hook)) && texts(j.patterns, 3) && texts(j.hookIdeas, 3),
  analysis_market: (j) => list(j.competitors) && texts(j.gaps) && isNum(j.opportunityScore, 0, 100) && isText(j.angle),
  creative_script: (j) => texts(j.hooks, 3) && (j.hooks as unknown[]).length === 3 && isNum(j.chosenHook, 0, 2) && isText(j.title)
    && every(j.script, 1, (p) => isNum(p.startSec, 0) && isNum(p.endSec, 0) && isText(p.spoken)),
  analysis_content_review: (j) => isNum(j.hookScore, 1, 10) && isNum(j.scriptScore, 1, 10) && Array.isArray(j.notes) && Array.isArray(j.mustFix),
  audit_content_quality: (j) => every(j.pieces, 1, (p) => isText(p.pieceId) && isNum(p.score, 1, 10) && Array.isArray(p.weakPoints)) && Array.isArray(j.honestyIssues),
  creative_scenes: (j) => isText(j.style) && every(j.scenes, 1, (s) => isText(s.id) && isText(s.imagePrompt) && isText(s.description)),
  creative_thumbnails: (j) => list(j.concepts, 3) && (j.concepts as unknown[]).length === 3
    && every(j.concepts, 3, (c) => isText(c.headline) && words(c.headline) <= 6 && isText(c.imagePrompt) && ['left', 'right', 'center'].includes(String(c.layout))),
  creative_campaign: (j) => every(j.platforms, 1, (p) => isText(p.platform) && isText(p.caption) && Array.isArray(p.hashtags)) && Array.isArray(j.ads) && Array.isArray(j.calendar),
  strategy_posting_times: (j) => every(j.times, 1, (t) => isText(t.platform) && isText(t.time)),
  security_content_check: (j) => typeof j.ok === 'boolean' && Array.isArray(j.issues),
};

/** The agent's answer as an object, or null when it is not usable. */
export function parseStepAnswer(actionType: string, text: string): unknown | null {
  const validate = VALIDATORS[actionType];
  if (!validate) return null;
  let parsed: unknown = null;
  try {
    parsed = extractJsonObject(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return validate(parsed as Json) ? parsed : null;
}

export const CONTENT_ACTION_KEYS: Record<string, string> = Object.fromEntries(Object.entries(ACTIONS).map(([id, a]) => [id, a.keys]));
