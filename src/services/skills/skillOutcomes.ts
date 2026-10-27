// What each skill's work achieved (agent roles Part C1): one record per finished step, with the
// skill it ran with and, once reviewed, the review's verdict. The Skills page shows the numbers;
// the Coach's "never used" check reads the last use from here.
export interface SkillOutcome {
  requestId: string;
  stepId: string;
  atMs: number;
  agent: string;
  skill: string | null;
  actionType: string;
  model: string | null;
  outcome: 'done' | 'failed' | 'setup_needed' | 'rejected';
  verdict?: 'pass' | 'fix';
}

const KEY = 'alphonso_skill_outcomes_v1';
// The words stored come from these lists, never from the caller's value, so nothing else can be saved.
const OUTCOMES = ['done', 'failed', 'setup_needed', 'rejected'] as const;
const VERDICTS = ['pass', 'fix'] as const;
const known = <T extends string>(list: readonly T[], value: unknown): T | undefined => list.find((w) => w === value);
const KEEP = 1000;
const DAY_MS = 24 * 3600 * 1000;

function readAll(): SkillOutcome[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeAll(list: SkillOutcome[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP))); } catch { /* storage full: the record is a convenience */ }
}

export function listSkillOutcomes(): SkillOutcome[] {
  return readAll();
}

/** One record per request step: a later outcome replaces the earlier one (a step carried on after an approval). */
export function recordStepOutcome(o: Omit<SkillOutcome, 'atMs'>, nowMs = Date.now()): void {
  const outcome = known(OUTCOMES, o.outcome);
  if (!outcome) return;
  const verdict = 'verdict' in o ? known(VERDICTS, o.verdict) : undefined;
  o = { ...o, outcome, ...('verdict' in o ? { verdict } : {}) };
  const all = readAll();
  const old = all.find((x) => x.requestId === o.requestId && x.stepId === o.stepId);
  const next: SkillOutcome = { ...old, ...o, atMs: nowMs, ...(old?.verdict && !('verdict' in o) ? { verdict: old.verdict } : {}) };
  writeAll([...all.filter((x) => x !== old), next]);
}

export function recordReviewVerdict(requestId: string, reviewedStepId: string, given: 'pass' | 'fix'): void {
  const verdict = known(VERDICTS, given);
  if (!verdict) return;
  const all = readAll();
  // The review can end before the run records the reviewed step's outcome: keep the verdict, and
  // recordStepOutcome() fills in the rest.
  if (!all.some((x) => x.requestId === requestId && x.stepId === reviewedStepId)) {
    writeAll([...all, { requestId, stepId: reviewedStepId, atMs: Date.now(), agent: '', skill: null, actionType: '', model: null, outcome: 'done', verdict }]);
    return;
  }
  writeAll(all.map((x) => (x.requestId === requestId && x.stepId === reviewedStepId ? { ...x, verdict } : x)));
}

const same = (a: string | null | undefined, b: string) => String(a || '').toLowerCase() === b.toLowerCase();

export function skillStats(agent: string, skill: string): { used: number; reviewed: number; passed: number; lastUsedMs: number | null } {
  const mine = readAll().filter((x) => x.agent === agent && same(x.skill, skill));
  return {
    used: mine.length,
    reviewed: mine.filter((x) => x.verdict).length,
    passed: mine.filter((x) => x.verdict === 'pass').length,
    lastUsedMs: mine.length ? Math.max(...mine.map((x) => x.atMs)) : null,
  };
}

function ago(ms: number, nowMs: number): string {
  const days = Math.floor((new Date(nowMs).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function statsLine(stats: { used: number; reviewed: number; passed: number; lastUsedMs: number | null }, nowMs = Date.now()): string {
  if (!stats.used) return 'Not used yet';
  const parts = [stats.used === 1 ? 'Used once' : `Used ${stats.used} times`];
  if (stats.reviewed) parts.push(`${stats.passed} of ${stats.reviewed} reviews passed`);
  if (stats.lastUsedMs) parts.push(`last used ${ago(stats.lastUsedMs, nowMs)}`);
  return parts.join(' · ');
}
