import { describe, it, expect, beforeEach } from 'vitest';
import { recordCoachHistory, getCoachHistory, clearCoachHistory } from '../services/coachHistoryService';
import type { CoachSignal } from '../services/coachEngineService';

function makeSignal(id: string, detectedAtMs = Date.now()): CoachSignal {
  return { id, severity: 'warning', message: `${id} fired`, detectedAtMs };
}

beforeEach(() => {
  clearCoachHistory();
});

describe('coachHistoryService', () => {
  it('starts empty', () => {
    expect(getCoachHistory()).toEqual([]);
  });

  it('records a fired signal', () => {
    recordCoachHistory(makeSignal('dead_letter_graveyard'));
    const history = getCoachHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('dead_letter_graveyard');
  });

  it('appends in order across multiple calls', () => {
    recordCoachHistory(makeSignal('a'));
    recordCoachHistory(makeSignal('b'));
    recordCoachHistory(makeSignal('c'));
    const history = getCoachHistory();
    expect(history.map((h) => h.id)).toEqual(['a', 'b', 'c']);
  });

  it('caps the ring buffer at 50 entries, dropping the oldest first', () => {
    for (let i = 0; i < 60; i++) {
      recordCoachHistory(makeSignal(`sig-${i}`));
    }
    const history = getCoachHistory();
    expect(history).toHaveLength(50);
    expect(history[0].id).toBe('sig-10');
    expect(history[49].id).toBe('sig-59');
  });

  it('clearCoachHistory empties the log', () => {
    recordCoachHistory(makeSignal('a'));
    clearCoachHistory();
    expect(getCoachHistory()).toEqual([]);
  });
});
