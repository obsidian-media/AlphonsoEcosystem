import { describe, expect, it } from 'vitest';
import {
  COACH_INTERVENTION_LEVELS,
  SESSION_GUARD_EVENT_TYPES,
  buildCoachIntervention,
  buildDemoSlotIntervention,
  chooseCoachInterventionLevel
} from '../services/coachInterventionService';

describe('coachInterventionService', () => {
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
});
