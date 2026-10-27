// Teams (agent roles Part C1): a team is a saved template whose steps keep each agent to work it
// owns. You build one on the Teams page, see every saved template with its problems, and run
// one by name ("use team Launch to …", "/team Launch …"). Replaces Agent Pairing, whose saved
// pairs nothing read; each old pair is offered once as a team.
import { checkPlan, type PlanStep } from './stepGraph';
import { inferEffects } from './joseEffects';
import { AGENT_PERMISSION_TABLE, isTaskTypeAllowed, ownerOf } from './agentPermissionTable';
import { agentName } from './agentNames';
import { deleteUserTemplate, listUserTemplates, saveUserTemplate } from './joseUserTemplates';
import type { JoseTemplate } from './joseTemplates';

export interface TeamMember { agent: string; actionType: string; instruction: string; needs: string[] }

export const TEAM_NEEDS_TEXT = 'Say what the team should do.';
export const TEAM_LABEL = (name: string) => `Steps set by your team ${name}.`;
export const TEAM_NOT_FOUND = (names: string[]) => (names.length
  ? `No team called that. Your teams: ${names.join(', ')}.`
  : 'You have no teams yet: make one on the Teams page.');
export const WHICH_TEAM = (names: string[]) => `Which team: ${names.join(', ')}?`;
export const NO_STEPS = 'This template has no steps.';

/** One step per member: ids by agent (`hector`, then `hector-2`…), effects from the task type. */
export function teamSteps(members: TeamMember[]): PlanStep[] {
  const seen = new Map<string, number>();
  return members.map((m) => {
    const n = (seen.get(m.agent) || 0) + 1;
    seen.set(m.agent, n);
    return {
      stepId: n === 1 ? m.agent : `${m.agent}-${n}`,
      agent: m.agent,
      actionType: m.actionType,
      instruction: m.instruction,
      needs: [...m.needs],
      effects: inferEffects(m.actionType),
    };
  });
}

/** What's wrong with a template, in plain words; nothing when it may run. */
export function templateProblems(template: Pick<JoseTemplate, 'steps'> & Partial<JoseTemplate>): string[] {
  const steps = template.steps || [];
  if (!steps.length) return [NO_STEPS];
  const plain: string[] = [];
  const wrongOwner = new Set<string>();
  for (const s of steps) {
    if (isTaskTypeAllowed(s.agent, s.actionType)) continue;
    const owner = ownerOf(s.actionType);
    if (owner && owner !== s.agent) {
      plain.push(`Gives ${agentName(owner)}'s work to ${agentName(s.agent)} (${s.actionType}).`);
      wrongOwner.add(s.stepId);
    }
  }
  const rest = checkPlan(steps, { taskTypes: true }).problems
    .filter((p) => ![...wrongOwner].some((id) => p.includes(`step "${id}"`) && p.includes('may not do')));
  return [...plain, ...rest];
}

export function saveTeam(input: { name: string; job: string; members: TeamMember[] }, id?: string): { ok: true; template: JoseTemplate } | { ok: false; problems: string[] } {
  const name = input.name.trim();
  if (!name) return { ok: false, problems: ['Give the team a name.'] };
  const steps = teamSteps(input.members);
  const problems = templateProblems({ steps });
  if (problems.length) return { ok: false, problems };
  if (id) deleteUserTemplate(id);
  const template = saveUserTemplate({ name, kind: 'normal', steps, requestText: input.job });
  return { ok: true, template };
}

export function findTeam(name: string): JoseTemplate | { ambiguous: string[] } | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const teams = listUserTemplates();
  const exact = teams.find((t) => t.name.toLowerCase() === wanted);
  if (exact) return exact;
  const starts = teams.filter((t) => t.name.toLowerCase().startsWith(wanted));
  if (starts.length === 1) return starts[0];
  if (starts.length > 1) return { ambiguous: starts.map((t) => t.name) };
  return null;
}

/** "/team <name> <request>", "use team <name> to <request>", "use team <name>: <request>". */
export function parseTeamRequest(text: string): { name: string; rest: string } | null {
  const t = String(text || '').trim();
  const slash = /^\/team\s+(.+)$/i.exec(t);
  if (slash) {
    const words = slash[1].trim();
    const teams = listUserTemplates().map((x) => x.name).sort((a, b) => b.length - a.length);
    const named = teams.find((n) => words.toLowerCase().startsWith(`${n.toLowerCase()} `) || words.toLowerCase() === n.toLowerCase());
    if (named) return { name: named, rest: words.slice(named.length).trim() };
    const [first, ...more] = words.split(/\s+/);
    return { name: first, rest: more.join(' ') };
  }
  const use = /^use\s+team\s+(.+?)(?:\s+to\s+|\s*:\s*)(.+)$/i.exec(t);
  if (use) return { name: use[1].trim(), rest: use[2].trim() };
  return null;
}

export async function runTeam(templateId: string, text: string, opts: { source: string; endpoint?: string; zeroCostMode?: boolean }): Promise<any> {
  const template = listUserTemplates().find((t) => t.id === templateId);
  if (!template) return { ok: false, reason: TEAM_NOT_FOUND(listUserTemplates().map((t) => t.name)) };
  if (!String(text || '').trim()) return { ok: false, reason: TEAM_NEEDS_TEXT };
  const problems = templateProblems(template);
  if (problems.length) return { ok: false, reason: 'plan_rejected', problems };
  const { submitStepsToJose } = await import('./submitToJose');
  return submitStepsToJose({
    text: text.trim(),
    source: opts.source,
    steps: template.steps.map((s) => ({ ...s })),
    label: TEAM_LABEL(template.name),
    ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    ...(typeof opts.zeroCostMode === 'boolean' ? { zeroCostMode: opts.zeroCostMode } : {}),
  } as never);
}

/** A team asked for by name: runs it, or says which team / that there is none. */
export async function runNamedTeam(request: { name: string; rest: string }, opts: { source: string; endpoint?: string; zeroCostMode?: boolean }): Promise<any> {
  const found = findTeam(request.name);
  if (!found) return { ok: false, reason: TEAM_NOT_FOUND(listUserTemplates().map((t) => t.name)) };
  if ('ambiguous' in found) return { ok: false, reason: WHICH_TEAM(found.ambiguous) };
  return runTeam(found.id, request.rest, opts);
}

// Old Agent Pairing pairs: offered once each, then gone.
const PAIRS_KEY = 'alphonso_agent_pairs_v1';
interface OldPair { id: string; agentA: string; agentB: string; triggerOn?: string; note?: string }
export interface OldPairOffer { id: string; agents: [string, string]; job: string; note: string }

function readPairs(): OldPair[] {
  try { const v = JSON.parse(localStorage.getItem(PAIRS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writePairs(list: OldPair[]): void {
  try {
    if (list.length) localStorage.setItem(PAIRS_KEY, JSON.stringify(list));
    else localStorage.removeItem(PAIRS_KEY);
  } catch { /* storage full */ }
}
const isAgent = (id: string) => Object.prototype.hasOwnProperty.call(AGENT_PERMISSION_TABLE, id);

export function oldPairOffers(): OldPairOffer[] {
  const pairs = readPairs();
  const real = pairs.filter((p) => isAgent(p.agentA) && isAgent(p.agentB));
  if (real.length !== pairs.length) writePairs(real);
  return real.map((p) => ({ id: p.id, agents: [p.agentA, p.agentB], job: String(p.triggerOn || ''), note: String(p.note || '') }));
}

export function dismissOldPair(id: string): void {
  writePairs(readPairs().filter((p) => p.id !== id));
}

export function takeOldPair(id: string): OldPairOffer | null {
  const offer = oldPairOffers().find((o) => o.id === id) || null;
  dismissOldPair(id);
  return offer;
}
