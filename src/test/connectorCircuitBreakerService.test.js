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
  configure,
  resetAllConfigs,
} from '../services/connectorCircuitBreakerService';

describe('connectorCircuitBreakerService', () => {
  beforeEach(() => {
    Object.keys(durableStorage).forEach((k) => delete durableStorage[k]);
    vi.clearAllMocks();
    resetAllConfigs();
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

  it('configure() overrides the failure threshold for one connector without affecting others', () => {
    configure('hermes_agents', { failureThreshold: 8 });
    for (let i = 0; i < 5; i++) recordFailure('hermes_agents');
    expect(isOpen('hermes_agents')).toBe(false);
    expect(getCircuitState('hermes_agents').failures).toBe(5);

    for (let i = 0; i < 3; i++) recordFailure('other_connector');
    for (let i = 0; i < 3; i++) recordFailure('hermes_agents');
    expect(isOpen('hermes_agents')).toBe(true);
    expect(isOpen('other_connector')).toBe(false);
  });

  it('configure() overrides the cooldown for one connector', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    configure('hermes_agents', { failureThreshold: 5, cooldownMs: 5_000 });
    for (let i = 0; i < 5; i++) recordFailure('hermes_agents');
    expect(isOpen('hermes_agents')).toBe(true);

    vi.spyOn(Date, 'now').mockReturnValue(6_000);
    expect(getCircuitState('hermes_agents').state).toBe('half-open');
  });

  it('configure() partial update preserves the other field', () => {
    configure('svc6', { failureThreshold: 10 });
    configure('svc6', { cooldownMs: 1_000 });
    vi.spyOn(Date, 'now').mockReturnValue(0);
    for (let i = 0; i < 9; i++) recordFailure('svc6');
    expect(isOpen('svc6')).toBe(false);
    for (let i = 0; i < 1; i++) recordFailure('svc6');
    expect(isOpen('svc6')).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    expect(getCircuitState('svc6').state).toBe('half-open');
  });
});
