// Echo's decisions (agent phase 7, owner 2026-10-26): one store for the whole ecosystem.
// Decisions never expire: a changed one is marked replaced, a removed one forgotten; nothing is
// deleted. Every text is saved with keys hidden. Each decision is linked in the memory graph to
// its request, its sources and the decision it replaced.
import { durableGet, durableSet } from '../../lib/durableStore.js';
import { randomId } from '../../lib/randomId';
import { redactText } from '../sentinel/exactChecks';
import { addEdge, addNode } from '../memoryGraphService';
import { TRUST_STATES } from '../trustModel';

export type DecisionKind = 'decision' | 'preference' | 'instruction' | 'rejection';
export type Surface = 'chat' | 'telegram' | 'whatsapp' | 'phone' | 'schedule' | 'boardroom' | 'miya' | 'project_execution' | 'settings' | 'other';

export interface Decision {
  id: string;
  kind: DecisionKind;
  text: string;
  why?: string;
  topics: string[];
  /** Preferences only: agent ids or task-type prefixes, or ['all']. */
  appliesTo?: string[];
  source: { surface: Surface; requestId?: string; stepIds?: string[]; sources?: string[]; by: string };
  atMs: number;
  status: 'active' | 'replaced' | 'forgotten';
  replaces?: string;
  replacedBy?: string;
}

export type NewDecision = Omit<Decision, 'id' | 'atMs' | 'status' | 'replacedBy'>;

/** The one place for every number about decisions. */
export const ECHO_LIMITS = {
  maxDecisions: 5000,
  stepChars: 2000,
  largeStepChars: 6000,
  perStep: 8,
  shownToModel: 12,
  recallMax: 20,
  /** Cleanup: how many decisions and old notes Echo looks over at once. */
  cleanupDecisions: 60,
  cleanupNotes: 40,
};

export const DECISIONS_KEY = 'alphonso_echo_decisions_v1';

function readAll(): Decision[] {
  try {
    const parsed = JSON.parse(durableGet(DECISIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Sent on every change, so screens update without polling. */
export const DECISIONS_CHANGED = 'alphonso:echo-decisions';

function writeAll(list: Decision[]): void {
  durableSet(DECISIONS_KEY, JSON.stringify(list));
  try { window.dispatchEvent(new Event(DECISIONS_CHANGED)); } catch { /* no window (tests, workers) */ }
}

function link(d: Decision): void {
  const confidence = d.source.by === 'you' ? TRUST_STATES.USER_CONFIRMED : TRUST_STATES.INFERRED;
  const opts = { confidence, createdBy: 'echo', createdEvent: d.id };
  void addNode('decision', d.id).then(async (node) => {
    if (!node) return;
    if (d.source.requestId) {
      const request = await addNode('jose_request', d.source.requestId);
      if (request) await addEdge(node, request, 'decided_in', opts);
    }
    for (const url of d.source.sources || []) {
      const source = await addNode('source', url);
      if (source) await addEdge(node, source, 'cites', opts);
    }
    if (d.replaces) await addEdge(node, `decision:${d.replaces}`, 'replaces', opts);
  }).catch(() => { /* the graph is a map; the store is the record */ });
}

export function addDecision(input: NewDecision): Decision {
  const list = readAll();
  const replaced = input.replaces ? list.find((d) => d.id === input.replaces && d.status === 'active') : undefined;
  const decision: Decision = {
    ...input,
    id: randomId('decision'),
    text: redactText(String(input.text || '').trim()),
    ...(input.why ? { why: redactText(String(input.why).trim()) } : {}),
    topics: (input.topics || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
    atMs: Date.now(),
    status: 'active',
  };
  delete decision.replaces;
  if (replaced) {
    decision.replaces = replaced.id;
    replaced.status = 'replaced';
    replaced.replacedBy = decision.id;
  }
  list.push(decision);
  writeAll(list);
  link(decision);
  return decision;
}

function change(id: string, patch: (d: Decision) => void): Decision | null {
  const list = readAll();
  const found = list.find((d) => d.id === id);
  if (!found) return null;
  patch(found);
  writeAll(list);
  return found;
}

export function editDecision(id: string, text: string): Decision | null {
  return change(id, (d) => { d.text = redactText(String(text || '').trim()); });
}

/** Marks a decision replaced by another (cleanup's merges and contradictions). */
export function replaceWith(oldId: string, newId: string): boolean {
  if (oldId === newId) return false;
  return change(oldId, (d) => { d.status = 'replaced'; d.replacedBy = newId; }) !== null;
}

export function forgetDecision(id: string): boolean {
  return change(id, (d) => { d.status = 'forgotten'; }) !== null;
}

export function getDecision(id: string): Decision | null {
  return readAll().find((d) => d.id === id) || null;
}

export function listDecisions(filter: { status?: Decision['status'] | 'all'; kind?: DecisionKind } = {}): Decision[] {
  const status = filter.status || 'active';
  return readAll()
    .filter((d) => (status === 'all' || d.status === status) && (!filter.kind || d.kind === filter.kind))
    .sort((a, b) => b.atMs - a.atMs);
}

export function activePreferences(): Decision[] {
  return listDecisions({ kind: 'preference' });
}

export function decisionIds(): string[] {
  return readAll().map((d) => d.id);
}

const SURFACES: Record<string, Surface> = {
  user: 'chat', chat: 'chat', telegram: 'telegram', whatsapp: 'whatsapp', companion: 'phone', phone: 'phone',
  schedule: 'schedule', boardroom: 'boardroom', miya: 'miya', content_factory: 'miya',
  project_execution: 'project_execution', settings: 'settings',
};

/** Where a request came from, from its `source`. */
export function surfaceOf(source: string | undefined): Surface {
  return SURFACES[String(source || '').toLowerCase()] || 'other';
}
