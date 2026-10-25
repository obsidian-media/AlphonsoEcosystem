// Nova's saved verdicts (agent phase 2): what /nova and Settings show instead of a score trend.
import { describe, it, expect, beforeEach } from 'vitest';
import { saveVerdict, listVerdicts, verdictForCommand, verdictsText, NO_VERDICTS, type SavedVerdict } from '../../../services/nova/novaVerdicts';

const v = (n: number, over: Partial<SavedVerdict> = {}): SavedVerdict => ({
  about: `Topic ${n}`, doFirst: `option ${n}`, requestId: `req-${n}`, commandId: `cmd-${n}`, atMs: Date.UTC(2026, 9, 25, 12) + n, text: `What to do first: option ${n}.`, ...over,
});

beforeEach(() => localStorage.clear());

describe('saved verdicts', () => {
  it('keeps the newest 30', () => {
    for (let i = 1; i <= 35; i += 1) saveVerdict(v(i));
    const all = listVerdicts(100);
    expect(all).toHaveLength(30);
    expect(all[0].about).toBe('Topic 35');
    expect(all[29].about).toBe('Topic 6');
  });

  it('lists 5 by default, newest first', () => {
    for (let i = 1; i <= 7; i += 1) saveVerdict(v(i));
    expect(listVerdicts().map((x) => x.about)).toEqual(['Topic 7', 'Topic 6', 'Topic 5', 'Topic 4', 'Topic 3']);
  });

  it('finds the verdict for a command', () => {
    saveVerdict(v(1));
    saveVerdict(v(2));
    expect(verdictForCommand('cmd-1')?.doFirst).toBe('option 1');
    expect(verdictForCommand('cmd-9')).toBeNull();
  });

  it('verdictsText lists about, do first and when', () => {
    saveVerdict(v(1, { about: 'Bakery marketing', doFirst: 'the email newsletter' }));
    expect(verdictsText(listVerdicts())).toContain('1. Bakery marketing: do first the email newsletter (25 Oct)');
  });

  it('verdictsText says how to get one when empty', () => {
    expect(verdictsText([])).toBe(NO_VERDICTS);
    expect(NO_VERDICTS).toBe('No verdicts yet: ask Jose something like "which of these should I do first?"');
  });
});
