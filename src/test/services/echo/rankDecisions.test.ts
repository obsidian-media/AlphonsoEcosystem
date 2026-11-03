// Phone phase 4: Echo ranks a list of decisions he is given (the phone's mirrored 50).
import { describe, expect, it } from 'vitest';
import { decisionsBlockFrom, rankDecisions } from '../../../services/echo/recall';
import type { Decision, DecisionKind } from '../../../services/echo/decisions';

const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
function decision(id: string, kind: DecisionKind, text: string, iso: string, extra: Partial<Decision> = {}): Decision {
  return { id, kind, text, topics: [], source: { surface: 'chat', by: 'echo' }, atMs: day(iso), status: 'active', ...extra };
}

const pool: Decision[] = [
  decision('d1', 'decision', 'The spring launch is on Friday 14 March', '2026-10-20', { why: 'the printer needs two weeks' }),
  decision('d2', 'preference', 'Emails are signed "Best, Sam"', '2026-10-12', { appliesTo: ['alphonso'] }),
  decision('d3', 'decision', 'The newsletter goes out on Mondays', '2026-09-30'),
  decision('d0', 'decision', 'The spring launch is on Friday 7 March', '2026-10-01', { status: 'replaced', replacedBy: 'd1' }),
];

describe('rankDecisions', () => {
  it('puts the matching decision first', () => {
    expect(rankDecisions(pool, 'When is the spring launch?', 5)[0].id).toBe('d1');
  });

  it('never returns a replaced decision', () => {
    expect(rankDecisions(pool, 'spring launch March', 5).map((d) => d.id)).not.toContain('d0');
  });

  it('keeps to the limit and returns nothing for no match', () => {
    expect(rankDecisions(pool, 'launch newsletter emails', 1)).toHaveLength(1);
    expect(rankDecisions(pool, 'zebra', 5)).toEqual([]);
  });
});

describe('decisionsBlockFrom', () => {
  it('gives an answer the preferences and the matching decisions', () => {
    const block = decisionsBlockFrom(pool, 'When is the spring launch?');
    expect(block.startsWith('Decisions you saved:')).toBe(true);
    expect(block).toContain('14 March');
    expect(block).toContain('Best, Sam');
    expect(block).not.toContain('7 March');
  });

  it('is empty with nothing to give', () => {
    expect(decisionsBlockFrom([], 'x')).toBe('');
  });
});
