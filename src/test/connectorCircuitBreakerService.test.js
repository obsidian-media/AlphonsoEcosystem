import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const durableStorage = {};
vi.mock('../lib/durableStore', () => ({
  durableGet: vi.fn((k) => durableStorage[k] ?? null),
  durableSet: vi.fn((k, v) => { durableStorage[k] = v; }),
  durableRemove: vi.fn((k) => { delete durableStorage[k]; }),
}));

import {
  recordSuccess,
  recordFailure,
  isOpen,
  getCircuitState,
  resetCircuit,
  getAll,
} from '../services/connectorCircuitBreakerService';

describe('connectorCircuitBreakerService', () => {
  beforeEach(() => {
    Object.keys(durableStorage).forEach((k) => delete durableStorage[k]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in closed state', () => {
    const { state, failures } = getCircuitState('test');
    expect(state).toBe('closed');
    expect(failures).toBe(0);
  });

  it('stays closed after fewer than 5 failures', () => {
    for (let i = 0; i < 4; i++) recordFailure('svc');
    expect(isOpen('svc')).toBe(false);
    expect(getCircuitState('svc').failures).toBe(4);
  });

  it('opens after 5 failures', () => {
    for (let i = 0; i < 5; i++) recordFailure('svc2');
    expect(isOpen('svc2')).toBe(true);
    expect(getCircuitState('svc2').state).toBe('open');
  });

  it('recordSuccess resets to closed', () => {
    for (let i = 0; i < 5; i++) recordFailure('svc3');
    expect(isOpen('svc3')).toBe(true);
    recordSuccess('svc3');
    expect(isOpen('svc3')).toBe(false);
    expect(getCircuitState('svc3').failures).toBe(0);
  });

  it('resetCircuit clears state', () => {
    for (let i = 0; i < 5; i++) recordFailure('svc4');
    resetCircuit('svc4');
    const { state, failures } = getCircuitState('svc4');
    expect(state).toBe('closed');
    expect(failures).toBe(0);
  });

  it('transitions to half-open after cooldown', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(0);
    for (let i = 0; i < 5; i++) recordFailure('svc5');
    // Simulate cooldown elapsed
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
    const { state } = getCircuitState('svc5');
    expect(state).toBe('half-open');
  });

  it('getAll returns states for all tracked connectors', () => {
    recordFailure('a');
    recordFailure('b');
    const all = getAll();
    expect(typeof all).toBe('object');
  });
});
