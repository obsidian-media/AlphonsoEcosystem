// What each agent is asked in a content-factory step, and how its answer is
// checked. A reply that does not match is refused (null): the step then fails
// and says so, it is never filled in with stock text.
import { extractJsonObject } from '../../lib/jsonUtils.js';
import { type ContentStepPayload, type StepId } from './contentTypes';
import { contentAsk } from '../skills/skillLibrary';
import { exactRiskText, findExactRisks, redactText } from '../sentinel/exactChecks';

type Json = Record<string, unknown>;

const HONEST_COPY = [
  'Honest copy: say content is AI-generated when it is.',
  'Never invent numbers, ratings, users, quotes or results.',
  'No claims the brand cannot back up.',
].join(' ');

/** Who each action is and the JSON keys it must return. What it is asked lives in its skill (src/skills, agent roles Part B). */
const ACTIONS: Record<string, { role: string; keys: string; uses: StepId[] }> = {
  research_virality: {
    role: 'Hector, Alphonso\'s research agent',
    keys: '{"references":[{"title":"the post\'s title","url":"its link","whyItWorks":"why it did well","hook":"its opening line, word for word"}],"patterns":["something the top posts have in common"],"hookIdeas":["an opening line for this video"]} (at least 3 references, 3 patterns and 3 hook ideas)',
    uses: [],
  },
  analysis_market: {
    role: 'Nova, Alphonso\'s opportunity analyst',
    keys: '{"competitors":[{"name":"a channel or brand","whatTheyDo":"what they make"}],"gaps":["something nobody covers well"],"opportunityScore":"a whole number from 0 to 100","angle":"the angle this video should take"}',
    uses: [],
  },
  creative_script: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"hooks":["first opening line","a different second opening line","a different third opening line"],"chosenHook":"0, 1 or 2: the position of the best hook","title":"the video\'s title","script":[{"startSec":"when this part starts, in seconds","endSec":"when it ends, in seconds","spoken":"the words said","onScreenText":"text shown on screen","bRoll":"what is shown","music":"the music at this moment"}]} (exactly 3 different hooks)',
    uses: ['research'],
  },
  analysis_content_review: {
    role: 'Nova, Alphonso\'s opportunity analyst',
    keys: '{"hookScore":"a whole number from 1 to 10","scriptScore":"a whole number from 1 to 10","notes":["what works or does not"],"mustFix":["what must change before it goes further"]}',
    uses: ['research', 'script'],
  },
  audit_content_quality: {
    role: 'Maria, Alphonso\'s quality and governance agent',
    keys: '{"pieces":[{"pieceId":"which piece, e.g. script or thumbnail-t1","score":"a whole number from 1 to 10","comparedTo":"the reference post you compared it with, or no reference known","weakPoints":["a weak point"]}],"honestyIssues":["an honesty problem, if any"]}',
    uses: ['research', 'script', 'scenes', 'thumbnail', 'carousel', 'campaign'],
  },
  creative_scenes: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"style":"the one look every scene shares","scenes":[{"id":"s1, s2, ...","startSec":"start, in seconds","endSec":"end, in seconds","description":"what happens in the scene","camera":"the camera angle","movement":"how the camera moves","imagePrompt":"what the picture shows, in detail","negativePrompt":"what the picture must not show","mainMoment":"true for a main moment, else false","character":"true when the brand character is in the scene, else false","motionSuggested":"true when a real movement would help, else false"}]}',
    uses: ['script'],
  },
  creative_thumbnails: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"concepts":[{"id":"t1, t2 or t3","headline":"at most 6 words","imagePrompt":"what the picture shows, in detail, with no text in it","layout":"left, right or center: where the headline goes"}]} (exactly 3 concepts in one list)',
    uses: ['research', 'script'],
  },
  creative_shorts: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"shorts":[{"kind":"mini, highlight or cut","title":"the Short\'s title","hook":"at most 12 words","seconds":"30 to 60","platforms":["youtube, instagram or facebook"],"copy":[{"platform":"youtube, instagram or facebook","title":"the title (YouTube)","caption":"the caption","hashtags":["#a-hashtag"]}],"parts":[{"spoken":"the words said (mini only)","imagePrompt":"what the picture shows, no text","seconds":"how long"}],"moment":{"startSec":"start in the finished video (highlight or cut)","endSec":"end"}}]}',
    uses: ['research', 'script', 'assemble'],
  },
  analysis_performance: {
    role: 'Nova, Alphonso\'s analyst',
    keys: '{"worked":["one sentence"],"didnt":["one sentence"]}',
    uses: ['script', 'thumbnail', 'campaign'],
  },
  creative_sfx: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"effects":[{"sceneId":"s1","text":"what the sound is","seconds":2}]}',
    uses: ['scenes'],
  },
  analysis_ideas: {
    role: 'Nova, Alphonso\'s analyst',
    keys: '{"ideas":["one line"]}',
    uses: ['research', 'script'],
  },
  creative_lessons: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"worked":["one sentence"],"didnt":["one sentence"]}',
    uses: ['script', 'thumbnail', 'campaign'],
  },
  creative_carousel: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"slides":[{"headline":"at most 8 words","body":"at most 25 words","imagePrompt":"what the picture shows, in detail, with no text in it"}]} (5 to 10 slides in one list)',
    uses: ['research', 'script'],
  },
  creative_campaign: {
    role: 'Miya, Alphonso\'s creative director',
    keys: '{"platforms":[{"platform":"the platform","caption":"the caption","hashtags":["#a-hashtag"],"description":"the description"}],"ads":[{"network":"meta, google or youtube","headline":"the ad headline","body":"the ad text"}],"short":{"title":"the Short\'s title, at most 100 characters","caption":"the Short\'s description","hashtags":["#a-hashtag"]},"carousel":{"caption":"the carousel\'s caption, only when there is a carousel","hashtags":["#a-hashtag"]},"calendar":[{"platform":"the platform","suggestedAt":"day and time","reason":"why then"}]}',
    uses: ['research', 'script', 'thumbnail', 'carousel'],
  },
  strategy_timing: {
    role: 'Nova, Alphonso\'s opportunity analyst',
    keys: '{"times":[{"platform":"the platform","dayOfWeek":"the day","time":"the time, e.g. 18:00","reason":"why then"}]}',
    uses: ['research'],
  },
  security_content_check: {
    role: 'Sentinel, Alphonso\'s security agent',
    keys: '{"ok":"true or false: whether everything is fine","issues":[{"what":"the problem","where":"the exact words or link","fix":"what to do"}]}',
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
  // Only kept lessons (phase 4a: lessons from real numbers wait until you keep them).
  const lessons = b.lessons.filter((l) => l.status !== 'proposed').slice(-10);
  if (lessons.length > 0) lines.push('Lessons from earlier feedback:', ...lessons.map((l) => `- ${l.text}`));
  return lines.join('\n');
}

const sameLink = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase();

/**
 * What is known about the brand's reference posts (agent phase 3): Maria never sees the posts
 * themselves, so she is given what Hector found about each (title, hook, why it works) and,
 * for a reference he didn't find, only its link and note.
 */
function referenceKnowledge(payload: ContentStepPayload): string {
  const found = ((payload.prior as any)?.research?.hector?.references || []) as Array<Record<string, unknown>>;
  const lines: string[] = [];
  for (const ref of payload.brand.references) {
    const match = found.find((f) => sameLink(f?.url, ref.url));
    const note = ref.note ? ` (your note: ${ref.note})` : '';
    if (match) {
      lines.push(`- ${match.title || ref.url} (${ref.url})${note}. Hook: "${match.hook || ''}". Why it works: ${match.whyItWorks || 'not said'}`);
    } else {
      lines.push(`- ${ref.url}: only its link is known${note}`);
    }
  }
  for (const f of found) {
    if (!payload.brand.references.some((r) => sameLink(r.url, f?.url)) && f?.title) {
      lines.push(`- ${f.title} (${f.url || 'no link'}), found by Hector. Hook: "${f.hook || ''}". Why it works: ${f.whyItWorks || 'not said'}`);
    }
  }
  return lines.length ? `What is known about the reference posts:\n${lines.join('\n').slice(0, 6000)}` : '';
}

/** Content steps may ask for help through Jose (Jose phase 7), the JSON wording of HELP_INSTRUCTION. */
export const CONTENT_HELP_LINE = 'If you need something another agent could provide (facts, a check), add "help": "<what you need>" to your JSON.';

/** The help a content step's JSON answer asks for, or null. */
export function helpFromAnswer(raw: string): string | null {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const help = (JSON.parse(text.slice(start, end + 1)) as { help?: unknown })?.help;
    return typeof help === 'string' && help.trim() ? help.trim().slice(0, 500) : null;
  } catch {
    return null;
  }
}

export function buildStepPrompt(payload: ContentStepPayload, agent: string, actionType: string, opts: { helpRound?: boolean } = {}): { system: string; prompt: string } {
  const action = ACTION_MAP.get(actionType);
  const ask = contentAsk(actionType);
  const brief = payload.brief;
  const system = `You are ${action?.role || agent}. ${HONEST_COPY} Return JSON only, with exactly these keys. Each value below describes what to write: replace it with your own content (numbers as numbers, true/false as booleans): ${action?.keys || '{}'}`;
  const parts = [
    ask || payload.task,
    payload.task && payload.task !== ask ? `Instruction: ${payload.task}` : '',
    `Idea: ${brief.idea}`,
    `Format: ${brief.format}. Length: about ${brief.lengthSec} seconds. Platforms: ${brief.platforms.join(', ') || 'not chosen'}. Outputs: ${brief.outputs.join(', ') || 'not chosen'}.`,
    brief.notes ? `Notes: ${brief.notes}` : '',
    brandText(payload),
  ];
  if (payload.sources && payload.sources.length > 0) {
    const list = payload.sources
      .map((s, i) => `${i + 1}. ${s.title}\n   ${s.url}\n   ${s.snippet}`)
      .join('\n')
      .slice(0, 8000);
    parts.push(`Web search results Hector found (the only sources you may use):\n${list}`);
  }
  if (actionType === 'audit_content_quality') {
    const known = referenceKnowledge(payload);
    if (known) parts.push(known);
  }
  // Sentinel's campaign check (agent phase 4): the exact checks as facts; keys hidden below.
  if (actionType === 'security_content_check') {
    const facts = findExactRisks(JSON.stringify(payload.prior.campaign ?? ''), { links: 'sent' });
    parts.push(facts.length ? `Exact checks already found (facts; list each as an issue):\n${facts.map((f) => `- ${exactRiskText(f)}`).join('\n')}` : 'Exact checks found nothing.');
  }
  for (const step of action?.uses || []) {
    if (payload.prior[step] !== undefined && actionType === 'security_content_check') parts.push(`${step} (earlier step):\n${redactText(JSON.stringify(payload.prior[step])).slice(0, 8000)}`);
    else if (payload.prior[step] !== undefined) parts.push(`${step} (earlier step):\n${JSON.stringify(payload.prior[step]).slice(0, 8000)}`);
  }
  if (actionType === 'creative_script' && brief.writeInMyVoice && payload.brand.pastScripts) {
    parts.push(`Write in this voice (the brand's past scripts):\n${payload.brand.pastScripts.slice(0, 6000)}`);
  }
  if (!opts.helpRound) parts.push(CONTENT_HELP_LINE);
  parts.push(`Return JSON only: ${action?.keys || '{}'}`);
  return { system, prompt: parts.filter(Boolean).join('\n\n') };
}

const isText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown, min = -Infinity, max = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Numbers and booleans written as text ("8", "true") become real ones, at any depth. */
function coerce(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coerce);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, coerce(v)]));
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
  }
  return value;
}
const list = (v: unknown, min = 0): v is Json[] => Array.isArray(v) && v.length >= min;
const texts = (v: unknown, min = 0) => Array.isArray(v) && v.length >= min && v.every(isText);
const every = (v: unknown, min: number, check: (item: Json) => boolean) => list(v, min) && v.every((item) => item && typeof item === 'object' && check(item));
const words = (v: unknown) => String(v || '').trim().split(/\s+/).filter(Boolean).length;

const VALIDATORS: Record<string, (j: Json) => boolean> = {
  research_virality: (j) => every(j.references, 1, (r) => isText(r.title) && isText(r.url) && isText(r.whyItWorks) && isText(r.hook)) && texts(j.patterns, 3) && texts(j.hookIdeas, 3),
  analysis_market: (j) => list(j.competitors) && texts(j.gaps) && isNum(j.opportunityScore, 0, 100) && isText(j.angle),
  creative_script: (j) => texts(j.hooks, 3) && (j.hooks as unknown[]).length === 3 && isNum(j.chosenHook, 0, 2) && isText(j.title)
    && every(j.script, 1, (p) => isNum(p.startSec, 0) && isNum(p.endSec, 0) && isText(p.spoken)),
  analysis_content_review: (j) => isNum(j.hookScore, 1, 10) && isNum(j.scriptScore, 1, 10) && Array.isArray(j.notes) && Array.isArray(j.mustFix),
  audit_content_quality: (j) => every(j.pieces, 1, (p) => isText(p.pieceId) && isNum(p.score, 1, 10) && Array.isArray(p.weakPoints)) && Array.isArray(j.honestyIssues),
  creative_scenes: (j) => isText(j.style) && every(j.scenes, 1, (s) => isText(s.id) && isText(s.imagePrompt) && isText(s.description)),
  creative_thumbnails: (j) => list(j.concepts, 3) && (j.concepts as unknown[]).length === 3
    && every(j.concepts, 3, (c) => isText(c.headline) && words(c.headline) <= 6 && isText(c.imagePrompt) && ['left', 'right', 'center'].includes(String(c.layout))),
  creative_shorts: (j) => list(j.shorts, 1),
  analysis_performance: (j) => texts(j.worked) && texts(j.didnt) && (j.worked as unknown[]).length + (j.didnt as unknown[]).length > 0,
  analysis_ideas: (j) => texts(j.ideas, 1),
  creative_sfx: (j) => Array.isArray(j.effects),
  creative_lessons: (j) => texts(j.worked) && texts(j.didnt) && (j.worked as unknown[]).length + (j.didnt as unknown[]).length > 0,
  creative_carousel: (j) => list(j.slides, 5) && (j.slides as unknown[]).length <= 10
    && every(j.slides, 5, (sl) => isText(sl.headline) && isText(sl.body) && isText(sl.imagePrompt) && words(sl.headline) <= 8 && words(sl.body) <= 25),
  creative_campaign: (j) => every(j.platforms, 1, (p) => isText(p.platform) && isText(p.caption) && Array.isArray(p.hashtags)) && Array.isArray(j.ads) && Array.isArray(j.calendar),
  strategy_timing: (j) => every(j.times, 1, (t) => isText(t.platform) && isText(t.time)),
  security_content_check: (j) => typeof j.ok === 'boolean' && Array.isArray(j.issues),
};

// Small local models (llama3.2:3b, seen 2026-10-22) repeat list items, leave a
// title empty, or nest objects in broken JSON. These repairs only reshape
// what the model wrote; nothing is made up, and the strict checks run after.

function repairScript(j: Json): Json {
  const raw = Array.isArray(j.hooks) ? j.hooks.map((h) => String(h ?? '').trim()).filter(Boolean) : [];
  const chosenText = typeof j.chosenHook === 'number' ? raw[j.chosenHook] : undefined;
  const hooks = [...new Set(raw)].slice(0, 3);
  const chosen = chosenText && hooks.includes(chosenText) ? hooks.indexOf(chosenText) : 0;
  const title = isText(j.title) ? j.title : hooks[chosen] || '';
  return { ...j, hooks, chosenHook: chosen, title };
}

/** Flat concept objects found anywhere in the answer text (duplicate keys and nesting included). */
function collectThumbnailConcepts(text: string): Json[] {
  const found: Json[] = [];
  for (const match of String(text || '').match(/\{[^{}]*"headline"[^{}]*\}/g) || []) {
    try {
      const item = JSON.parse(match);
      if (item && isText(item.headline) && isText(item.imagePrompt)) found.push(item);
    } catch { /* not a whole object */ }
  }
  return found;
}

function repairThumbnails(j: Json, text: string): Json {
  const seen = new Set<string>();
  const concepts = collectThumbnailConcepts(text)
    .filter((c) => {
      const key = String(c.headline).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((c, i) => ({
      ...c,
      id: `t${i + 1}`,
      headline: String(c.headline).trim(),
      layout: ['left', 'right', 'center'].includes(String(c.layout)) ? c.layout : String(c.layout) === 'middle' ? 'center' : 'left',
    }));
  return concepts.length > 0 ? { ...j, concepts } : j;
}

const PLATFORMS = ['youtube', 'instagram', 'facebook'];
const platformList = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.map((p) => String(p).trim().toLowerCase()).filter((p) => PLATFORMS.includes(p)))] : []);
const cutWords = (v: unknown, max: number) => String(v ?? '').trim().split(/\s+/).filter(Boolean).slice(0, max).join(' ');

/** Shorts as Miya wrote them, kept only when each has what its kind needs (phase 3d). */
function repairShorts(shorts: Json[], defaultPlatforms: string[]): Json[] {
  const kept: Json[] = [];
  for (const raw of shorts) {
    if (!raw || typeof raw !== 'object') continue;
    const kind = ['mini', 'highlight', 'cut'].includes(String(raw.kind)) ? String(raw.kind) : 'mini';
    const parts = Array.isArray(raw.parts)
      ? (raw.parts as Json[]).filter((p) => p && isText(p.spoken) && isText(p.imagePrompt)).map((p) => ({ spoken: String(p.spoken).trim(), imagePrompt: String(p.imagePrompt).trim(), seconds: isNum(p.seconds, 0) ? p.seconds : 0 }))
      : [];
    const m = raw.moment as Json | undefined;
    const moment = m && isNum(m.startSec, 0) && isNum(m.endSec, 0) && (m.endSec as number) > (m.startSec as number) ? { startSec: m.startSec, endSec: m.endSec } : null;
    if (kind === 'mini' ? parts.length === 0 : !moment) continue;
    const platforms = platformList(raw.platforms);
    kept.push({
      ...raw,
      id: `sh${kept.length + 1}`,
      kind,
      title: String(raw.title ?? '').trim(),
      hook: cutWords(raw.hook, 12),
      seconds: Math.min(60, Math.max(30, isNum(raw.seconds, 0) ? (raw.seconds as number) : 45)),
      platforms: platforms.length ? platforms : platformList(defaultPlatforms),
      copy: Array.isArray(raw.copy) ? (raw.copy as Json[]).filter((c) => c && PLATFORMS.includes(String(c.platform).toLowerCase())).map((c) => ({ ...c, platform: String(c.platform).toLowerCase(), hashtags: Array.isArray(c.hashtags) ? c.hashtags : [] })) : [],
      ...(kind === 'mini' ? { parts } : { moment }),
    });
  }
  return kept;
}

/** The agent's answer as an object, or null when it is not usable. */
export function parseStepAnswer(actionType: string, text: string, options: { allowedUrls?: string[]; defaultPlatforms?: string[] } = {}): unknown | null {
  // Own keys only: a name like "constructor" must not find Object's methods (CodeQL).
  const validate = VALIDATOR_MAP.get(actionType);
  if (!validate) return null;
  let parsed: unknown = null;
  try {
    parsed = extractJsonObject(text);
  } catch {
    parsed = null;
  }
  if (actionType === 'creative_thumbnails') {
    // Concepts can be lost when the JSON repeats a key, so read them from the text.
    parsed = repairThumbnails(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Json) : {}, text);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  parsed = coerce(parsed);
  let answer = actionType === 'creative_script' ? repairScript(parsed as Json) : (parsed as Json);
  if (options.allowedUrls && Array.isArray(answer.references)) {
    // Only links Hector actually found; a model without internet invents them.
    const allowed = new Set(options.allowedUrls.map((u) => u.trim()));
    answer = { ...answer, references: (answer.references as Json[]).filter((r) => allowed.has(String(r?.url || '').trim())) };
  }
  if (actionType === 'security_content_check' && Array.isArray(answer.issues)) {
    // Each issue says what, where and the fix (agent phase 4); a plain string is still read.
    answer = { ...answer, issues: (answer.issues as unknown[]).map((i) => (typeof i === 'string'
      ? { what: i.trim(), where: '', fix: '' }
      : { what: String((i as Json)?.what ?? '').trim(), where: String((i as Json)?.where ?? '').trim(), fix: String((i as Json)?.fix ?? '').trim() })).filter((i) => i.what) };
  }
  if (actionType === 'creative_sfx') {
    // At most one per scene, 0.5–30 s, with a description (phase 4b).
    const seen = new Set<string>();
    const effects = (Array.isArray(answer.effects) ? answer.effects as Json[] : []).flatMap((e) => {
      const sceneId = String(e?.sceneId ?? '').trim();
      const text = String(e?.text ?? '').trim().slice(0, 300);
      if (!sceneId || !text || seen.has(sceneId)) return [];
      seen.add(sceneId);
      const seconds = Math.min(30, Math.max(0.5, Number(e?.seconds) || 2));
      return [{ sceneId, text, seconds }];
    });
    answer = { effects };
  }
  if (actionType === 'analysis_ideas') {
    answer = { ideas: (Array.isArray(answer.ideas) ? answer.ideas : []).map((t) => String(t ?? '').trim().slice(0, 160)).filter(Boolean).slice(0, 3) };
  }
  if (actionType === 'analysis_performance' || actionType === 'creative_lessons') {
    // Up to 3 a side, one sentence each (phase 4a).
    const clean = (v: unknown) => (Array.isArray(v) ? v : []).map((t) => String(t ?? '').trim().slice(0, 240)).filter(Boolean).slice(0, 3);
    answer = { worked: clean(answer.worked), didnt: clean(answer.didnt) };
  }
  if (actionType === 'creative_shorts' && Array.isArray(answer.shorts)) {
    answer = { ...answer, shorts: repairShorts(answer.shorts as Json[], options.defaultPlatforms || []) };
  }
  if (actionType === 'creative_carousel' && Array.isArray(answer.slides)) {
    // Ids by position (slide 1 is the cover); over-long text is cut to the limits.
    const cut = (v: unknown, max: number) => String(v ?? '').trim().split(/\s+/).filter(Boolean).slice(0, max).join(' ');
    answer = {
      ...answer,
      slides: (answer.slides as Json[]).map((sl, i) => ({
        ...sl, id: `c${i + 1}`, cover: i === 0, headline: cut(sl?.headline, 8), body: cut(sl?.body, 25), imagePrompt: String(sl?.imagePrompt ?? '').trim(),
      })),
    };
  }
  if (actionType === 'creative_scenes' && Array.isArray(answer.scenes)) {
    // Pictures are matched to scenes by id, so ids must be unique.
    // A main moment is only an explicit true (phase 2b).
    answer = { ...answer, scenes: (answer.scenes as Json[]).map((scene, i) => ({ ...scene, id: `s${i + 1}`, mainMoment: scene?.mainMoment === true, character: scene?.character !== false, motionSuggested: scene?.motionSuggested === true })) };
  }
  return validate(answer) ? answer : null;
}

// Looked up through Maps so an unknown name can never reach another object's method (CodeQL 36).
const ACTION_MAP = new Map(Object.entries(ACTIONS));
const VALIDATOR_MAP = new Map(Object.entries(VALIDATORS));

export const CONTENT_ACTION_KEYS: Record<string, string> = Object.fromEntries(Object.entries(ACTIONS).map(([id, a]) => [id, a.keys]));
