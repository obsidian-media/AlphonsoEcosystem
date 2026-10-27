// Where a send goes (agent phase 5): a destination the step already names, else Marcus's own
// model picks one from the connectors you set up. Every answer is checked with isAllowedTarget().
import { generateAgentLlmResponse } from '../../lib/ollama';
import { redactText } from '../sentinel/exactChecks';
import { MARCUS_CONNECTORS, destinationsFor, isAllowedTarget, requestWithoutQuotes, targetLabel } from './destinations';
import { checkComposioAnswer, composioSendTools, describeComposioTools } from './composioChannel';
import type { ComposioTool } from '../composioService';
import type { Destination, MarcusConnector, SendKind } from './types';

export const NO_DESTINATION = "Marcus couldn't tell where to send this: name the channel, or set a default in Settings → Connectors.";
// A newsletter (agent roles Part C2) goes through an n8n workflow or a mail app in Composio only.
export const NEWSLETTER_NEEDS = 'A newsletter goes through an n8n workflow or a mail app in Composio. Set one up in Settings → Connectors, then carry on.';
const MAIL_TOOLKITS = new Set(['gmail', 'outlook', 'mailchimp', 'sendgrid', 'brevo']);
const NEWSLETTER_CONNECTORS: MarcusConnector[] = ['n8n', 'composio'];
/** Composio's tools from mail apps only. */
export function mailTools(tools: ComposioTool[]): ComposioTool[] {
  return tools.filter((t) => MAIL_TOOLKITS.has(String(t.toolkit || '').toLowerCase()));
}
export const CAMPAIGN_STUDIO_ONLY = "Marcus posts to Instagram, Facebook and YouTube from Miya Studio's Campaign Studio.";
export const NEEDS_VERSION = 'Say which version to release.';

const CAMPAIGN_PLATFORMS = new Set(['instagram', 'facebook', 'youtube', 'meta']);
const VERSION = /\bv?\d+\.\d+(?:\.\d+)*\b/i;

type Picked = { ok: true; destination: Destination } | { ok: false; outcome: 'setup' | 'failed'; reason: string };

/** A connector named in the task type (`distribution_slack`; releases and issues are GitHub's). */
export function hintFromTaskType(actionType: unknown): MarcusConnector | undefined {
  const t = String(actionType || '').toLowerCase();
  if (/distribution_(release|issue)/.test(t)) return 'github';
  return MARCUS_CONNECTORS.find((c) => t.includes(c));
}

function kindFromTaskType(actionType: unknown): SendKind | undefined {
  const t = String(actionType || '').toLowerCase();
  if (t.includes('release')) return 'release';
  if (t.includes('issue')) return 'issue';
  return undefined;
}

function firstLine(text: string, max = 80): string {
  const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Checks one candidate; a problem sentence for the model when it is not usable. */
function check(candidate: { connector?: unknown; target?: unknown; kind?: unknown; title?: unknown }, request: string, text: string):
  { picked: Picked } | { problem: string } {
  const connector = String(candidate.connector || '').toLowerCase().trim();
  if (CAMPAIGN_PLATFORMS.has(connector)) return { picked: { ok: false, outcome: 'failed', reason: CAMPAIGN_STUDIO_ONLY } };
  if (!MARCUS_CONNECTORS.includes(connector as MarcusConnector)) return { problem: `"${connector || 'nothing'}" is not a connector Marcus sends with.` };
  const c = connector as MarcusConnector;
  const info = destinationsFor(c);
  if (!info.setUp) return { picked: { ok: false, outcome: 'setup', reason: info.setUpSentence as string } };
  const kind = (info.kinds.includes(candidate.kind as SendKind) ? candidate.kind : info.kinds[0]) as SendKind;
  let target = String(candidate.target ?? '').trim();
  if (!target && (c === 'notion' || c === 'clickup')) target = info.defaults[0] || '';
  if (!target && info.defaults.length === 1 && c !== 'telegram') target = info.defaults[0];
  if (!isAllowedTarget(c, target, request)) return { problem: `"${target || 'no target'}" was not named in the request and is not a default.` };
  const destination: Destination = { connector: c, target, kind, label: '' };
  if (kind === 'release') {
    const version = (VERSION.exec(request.replace(/sk-[\w-]+/g, '')) || [])[0];
    if (!version) return { picked: { ok: false, outcome: 'failed', reason: NEEDS_VERSION } };
    destination.title = version;
  } else if (kind === 'issue' || kind === 'page' || kind === 'task') {
    destination.title = String(candidate.title || '').trim() || firstLine(text);
  }
  destination.label = targetLabel(destination);
  return { picked: { ok: true, destination } };
}

function prompt(request: string, text: string, offered: MarcusConnector[], problem: string | null, composioTools: ComposioTool[] = []): string {
  const lines = offered.filter((c) => c !== 'composio').map((c) => {
    const info = destinationsFor(c);
    return `- ${c}: makes ${info.kinds.join(' or ')}; defaults: ${info.defaults.length ? info.defaults.join(', ') : 'none'}`;
  });
  return [
    'You are Marcus. You choose where an approved piece of work is sent; you never change what is said.',
    'Pick one destination from the connectors below. The target must be named in the request or be one of the defaults. For Telegram the target is "team" (the team chat) or "me".',
    `Connectors that are set up:\n${lines.join('\n')}`,
    composioTools.length ? `Composio tools you may use (answer with "connector": "composio", the "tool", the recipient as "target", and "arguments"; the text goes in for you):\n${describeComposioTools(composioTools)}` : '',
    `Request: ${redactText(request)}`,
    `What will be sent (start): ${redactText(String(text || '').slice(0, 500))}`,
    problem ? `Your last answer could not be used: ${problem} Choose again.` : '',
    'Answer with JSON only: {"connector": "slack", "target": "#news", "kind": "message", "title": "", "reason": "the request names #news"}',
  ].filter(Boolean).join('\n\n');
}

function readAnswer(raw: string): Record<string, unknown> | null {
  const s = String(raw || '');
  for (const candidate of [s, s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(candidate);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* not JSON */ }
  }
  return null;
}

export async function pickDestination(
  request: string,
  text: string,
  opts: { given?: Partial<Destination>; hint?: MarcusConnector; actionType?: string } = {},
): Promise<Picked> {
  const kindHint = kindFromTaskType(opts.actionType);
  const newsletter = opts.actionType === 'distribution_newsletter';
  if (newsletter && opts.given?.connector && !NEWSLETTER_CONNECTORS.includes(opts.given.connector)) {
    return { ok: false, outcome: 'setup', reason: NEWSLETTER_NEEDS };
  }
  if (opts.given?.connector && (opts.given.target || opts.given.connector === 'notion' || opts.given.connector === 'clickup')) {
    const got = check({ ...opts.given, kind: opts.given.kind || kindHint }, request, text);
    return 'picked' in got ? got.picked : { ok: false, outcome: 'failed', reason: `${got.problem} ${NO_DESTINATION}` };
  }
  // A connector the request names but that isn't set up says so, without asking the model.
  const asked = requestWithoutQuotes(request).toLowerCase();
  const named = MARCUS_CONNECTORS.filter((c) => c !== 'composio' && new RegExp(`\\b${c}\\b`).test(asked))
    .filter((c) => !newsletter || NEWSLETTER_CONNECTORS.includes(c));
  const hint = opts.given?.connector || opts.hint || (named.length === 1 ? named[0] : undefined);
  if (hint) {
    const info = destinationsFor(hint);
    if (!info.setUp) return { ok: false, outcome: 'setup', reason: info.setUpSentence as string };
  }
  const offered = (hint ? [hint] : MARCUS_CONNECTORS).filter((c) => destinationsFor(c).setUp)
    .filter((c) => !newsletter || NEWSLETTER_CONNECTORS.includes(c));
  // One connector, and the request names one of its defaults or listed workflows: no model needed.
  if (hint && hint !== 'composio' && offered.length === 1) {
    const namedTargets = destinationsFor(hint).defaults.filter((d) => d && asked.includes(d.toLowerCase()));
    if (namedTargets.length === 1) {
      const got = check({ connector: hint, target: namedTargets[0], kind: kindHint }, request, text);
      if ('picked' in got) return got.picked;
    }
  }
  // Composio's send tools (agent phase 5), only from the toolkits you switched on.
  const allTools = offered.includes('composio') ? await composioSendTools().catch(() => []) : [];
  const composioTools = newsletter ? mailTools(allTools) : allTools;
  if (!offered.filter((c) => c !== 'composio').length && !composioTools.length) {
    return newsletter ? { ok: false, outcome: 'setup', reason: NEWSLETTER_NEEDS } : { ok: false, outcome: 'failed', reason: NO_DESTINATION };
  }
  let problem: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw = '';
    try {
      const result = await generateAgentLlmResponse('marcus', { prompt: prompt(request, text, offered, problem, composioTools), format: 'json' });
      raw = String((result as { response?: unknown })?.response || '');
    } catch {
      return { ok: false, outcome: 'failed', reason: NO_DESTINATION };
    }
    const answer = readAnswer(raw);
    if (!answer) { problem = 'It was not JSON.'; continue; }
    if (String(answer.connector || '').toLowerCase() === 'composio') {
      const c = checkComposioAnswer(answer, composioTools, request, text);
      if ('destination' in c) return { ok: true, destination: c.destination };
      problem = c.problem;
      continue;
    }
    const answered = String(answer.connector || '').toLowerCase().trim();
    if (MARCUS_CONNECTORS.includes(answered as MarcusConnector) && !offered.includes(answered as MarcusConnector)) {
      problem = `"${answered}" is not one of the connectors offered.`;
      continue;
    }
    const got = check({ ...answer, kind: answer.kind || kindHint }, request, text);
    if ('picked' in got) return got.picked;
    problem = got.problem;
  }
  return { ok: false, outcome: 'failed', reason: NO_DESTINATION };
}

