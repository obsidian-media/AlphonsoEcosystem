import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COACH_INTERVENTION_ACTION_LOG_KEY,
  COACH_INTERVENTION_LEVELS,
  SESSION_GUARD_BRIDGE_EVENT,
  SESSION_GUARD_BRIDGE_STORAGE_KEY,
  SESSION_GUARD_EVENT_TYPES,
  buildCoachIntervention,
  buildDemoSlotIntervention,
  chooseCoachInterventionLevel,
  listCoachInterventionActionLog,
  listSessionGuardBridgeEvents,
  pushSessionGuardBridgeEvent,
  recordCoachInterventionAction,
  subscribeSessionGuardBridge
} from '../services/coachInterventionService';

describe('coachInterventionService', () => {
  beforeEach(() => {
    localStorage.removeItem(SESSION_GUARD_BRIDGE_STORAGE_KEY);
    localStorage.removeItem(COACH_INTERVENTION_ACTION_LOG_KEY);
  });

  it('builds a firm protective slot intervention from SessionGuard metrics', () => {
    const intervention = buildDemoSlotIntervention();
    expect(intervention.source).toBe('sessionguard');
    expect(intervention.sessionType).toBe('slot_machine');
    expect(intervention.level).toBe(COACH_INTERVENTION_LEVELS.FIRM);
    expect(intervention.message).toContain('82 spins in');
    expect(intervention.message).toContain('net -$43.25');
    expect(intervention.message).toContain('Pause for 60 seconds');
    expect(intervention.localOnly).toBe(true);
  });

  it('escalates chase patterns and deep losing stretches to hard pauses', () => {
    expect(chooseCoachInterventionLevel({
      type: SESSION_GUARD_EVENT_TYPES.CHASE_PATTERN,
      metrics: { spinCount: 140, netResult: -80, longestLosingStretch: 18 }
    })).toBe(COACH_INTERVENTION_LEVELS.HARD);

    expect(chooseCoachInterventionLevel({
      type: SESSION_GUARD_EVENT_TYPES.LOSS_STRETCH,
      metrics: { longestLosingStretch: 25 }
    })).toBe(COACH_INTERVENTION_LEVELS.HARD);
  });

  it('keeps mild events as quiet nudges', () => {
    const intervention = buildCoachIntervention({
      type: SESSION_GUARD_EVENT_TYPES.HIGH_VOLATILITY,
      severity: 'info',
      metrics: { spinCount: 12, netResult: -4, longestLosingStretch: 3 }
    });
    expect(intervention.level).toBe(COACH_INTERVENTION_LEVELS.QUIET);
    expect(intervention.message).toContain('Heads up');
  });

  it('bridges SessionGuard JSON into a stored CoachInterventionCard payload', () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_GUARD_BRIDGE_EVENT, listener);

    const bridgeEvent = pushSessionGuardBridgeEvent({
      id: 'sg-1',
      sessionType: 'slot_machine',
      type: SESSION_GUARD_EVENT_TYPES.BANKROLL_DROP,
      severity: 'critical',
      metrics: { spins: 101, net: -125 }
    });

    expect(bridgeEvent.intervention.level).toBe(COACH_INTERVENTION_LEVELS.HARD);
    expect(listSessionGuardBridgeEvents()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_GUARD_BRIDGE_EVENT, listener);
  });

  it('subscribes to local bridge events and records local-only action choices', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeSessionGuardBridge(subscriber);
    const bridgeEvent = pushSessionGuardBridgeEvent({ metrics: { longestLosingStretch: 12 } });

    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ intervention: bridgeEvent.intervention }));

    const entry = recordCoachInterventionAction(bridgeEvent.intervention, 'pause_60_seconds', { durationMs: 60000 });
    expect(entry.localOnly).toBe(true);
    expect(listCoachInterventionActionLog()).toContainEqual(expect.objectContaining({ action: 'pause_60_seconds' }));

    unsubscribe();
  });
});
