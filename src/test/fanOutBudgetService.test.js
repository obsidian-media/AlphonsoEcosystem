import { describe, expect, it } from 'vitest';
import { createFanOutBudgetTracker, DEFAULT_FANOUT_CHAR_BUDGET } from '../services/fanOutBudgetService';

describe('fanOutBudgetService', () => {
  it('starts with zero spent and the full limit remaining', () => {
    const tracker = createFanOutBudgetTracker(1000);
    expect(tracker.limit).toBe(1000);
    expect(tracker.spent).toBe(0);
    expect(tracker.remaining()).toBe(1000);
    expect(tracker.isExceeded()).toBe(false);
  });

  it('accumulates usage across multiple recordUsage calls', () => {
    const tracker = createFanOutBudgetTracker(1000);
    tracker.recordUsage(300);
    tracker.recordUsage(400);
    expect(tracker.spent).toBe(700);
    expect(tracker.remaining()).toBe(300);
    expect(tracker.isExceeded()).toBe(false);
  });

  it('reports exceeded once spent reaches or passes the limit', () => {
    const tracker = createFanOutBudgetTracker(1000);
    tracker.recordUsage(1000);
    expect(tracker.isExceeded()).toBe(true);
    expect(tracker.remaining()).toBe(0);
  });

  it('reports exceeded when a single usage overshoots the limit', () => {
    const tracker = createFanOutBudgetTracker(1000);
    tracker.recordUsage(5000);
    expect(tracker.isExceeded()).toBe(true);
    expect(tracker.remaining()).toBe(0);
  });

  it('ignores negative or non-numeric usage rather than reducing spent', () => {
    const tracker = createFanOutBudgetTracker(1000);
    tracker.recordUsage(-500);
    tracker.recordUsage(NaN);
    expect(tracker.spent).toBe(0);
  });

  it('defaults to DEFAULT_FANOUT_CHAR_BUDGET when no limit is given', () => {
    const tracker = createFanOutBudgetTracker();
    expect(tracker.limit).toBe(DEFAULT_FANOUT_CHAR_BUDGET);
  });

  it('keeps independent state across separate tracker instances', () => {
    const a = createFanOutBudgetTracker(1000);
    const b = createFanOutBudgetTracker(1000);
    a.recordUsage(900);
    expect(a.spent).toBe(900);
    expect(b.spent).toBe(0);
  });
});
