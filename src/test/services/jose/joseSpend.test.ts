import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../services/connectors/connectorAuth', () => ({
  isConnectorAuthenticated: vi.fn((id: string) => ({ ok: (globalThis as any).__paidConnectors?.includes(id) ?? true })),
}));

import {
  getPaidModelSettings, paidModelAvailable, estimateCostUsd, recordSpend, monthSpendUsd, canSpend, recordSpendUsd,
} from '../../../services/jose/joseSpend';

const paid = { allowed: true, provider: 'claude', model: 'claude-haiku-5-5', inputPerMillionUsd: 3, outputPerMillionUsd: 15, monthlyCapUsd: 1 };
const setSettings = (patch: Record<string, unknown> = {}, paidPatch: Record<string, unknown> = {}) =>
  localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false, ...patch, paidModels: { ...paid, ...paidPatch } }));

beforeEach(() => {
  localStorage.clear();
  (globalThis as any).__paidConnectors = ['claude', 'chatgpt'];
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 23, 12));
});
afterEach(() => vi.useRealTimers());

describe('paidModelAvailable', () => {
  it('is available only when allowed, Zero-Cost Mode is off, the connector is set up and both prices are entered', () => {
    setSettings();
    expect(paidModelAvailable()).toEqual({ ok: true });
  });

  it.each([
    ['allowed off', {}, { allowed: false }, /Paid models are off/],
    ['Zero-Cost Mode on', { zeroCostMode: true }, {}, /Zero-Cost Mode is on/],
    ['no price', {}, { outputPerMillionUsd: null }, /Enter the prices/],
    ['no model chosen', {}, { provider: null }, /Choose a paid model/],
  ])('says why not: %s', (_name, patch, paidPatch, reason) => {
    setSettings(patch, paidPatch);
    const result = paidModelAvailable();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(reason);
  });

  it('says why not: connector missing', () => {
    setSettings();
    (globalThis as any).__paidConnectors = [];
    expect(paidModelAvailable()).toEqual({ ok: false, reason: 'Claude is not set up in Connectors.' });
  });

  it('treats Zero-Cost Mode as on when it was never set', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ paidModels: paid }));
    expect(paidModelAvailable().ok).toBe(false);
  });

  it('reads nothing usable from an empty or broken setting', () => {
    localStorage.setItem('alphonso_settings', '{not json');
    expect(getPaidModelSettings()).toEqual({ allowed: false, provider: null, model: null, inputPerMillionUsd: null, outputPerMillionUsd: null, monthlyCapUsd: null, runwayPricePerSecondUsd: null });
  });
});

describe('costs', () => {
  it('estimates from characters and output tokens at the entered prices', () => {
    setSettings();
    expect(estimateCostUsd(4000, 1000)).toBeCloseTo(0.003 + 0.015, 10);
  });

  it('adds spend up within a month and starts again in the next', () => {
    setSettings();
    expect(recordSpend({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(3, 10);
    expect(recordSpend({ inputTokens: 0, outputTokens: 100_000 })).toBeCloseTo(4.5, 10);
    expect(monthSpendUsd()).toBeCloseTo(4.5, 10);
    vi.setSystemTime(new Date(2026, 10, 1, 9));
    expect(monthSpendUsd()).toBe(0);
    expect(recordSpend({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(3, 10);
  });

  it('refuses what would pass the monthly cap', () => {
    setSettings();
    recordSpend({ inputTokens: 300_000, outputTokens: 0 }); // $0.90
    expect(canSpend(0.05)).toEqual({ ok: true });
    const refused = canSpend(0.2);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('That would pass your monthly cap of $1.00 ($0.90 spent this month).');
  });

  it('has no cap when the cap is blank', () => {
    setSettings({}, { monthlyCapUsd: null });
    expect(canSpend(1000)).toEqual({ ok: true });
  });
});

// Miya content factory phase 2b: Runway clips share the monthly total and cap.
describe('Runway spending', () => {
  it('reads the price per second you entered, blank when not entered', () => {
    setSettings({}, { runwayPricePerSecondUsd: 0.05 });
    expect(getPaidModelSettings().runwayPricePerSecondUsd).toBe(0.05);
    setSettings({}, { runwayPricePerSecondUsd: '' });
    expect(getPaidModelSettings().runwayPricePerSecondUsd).toBeNull();
  });

  it('adds a Runway clip to the same month total that the cap checks', () => {
    setSettings();
    recordSpendUsd(0.5);
    expect(monthSpendUsd()).toBeCloseTo(0.5);
    recordSpend({ inputTokens: 0, outputTokens: 0 });
    expect(recordSpendUsd(0.25)).toBeCloseTo(0.75);
    expect(canSpend(0.3).ok).toBe(false);
    expect(recordSpendUsd(-1)).toBeCloseTo(0.75);
  });
});
