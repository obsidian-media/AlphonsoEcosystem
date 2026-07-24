import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COACH_INTERVENTION_ACTION_LOG_KEY,
  COACH_INTERVENTION_LEVELS,
  COACH_ENGINE_EVENT,
  COACH_ENGINE_EVENT_TYPES,
  COACH_ENGINE_STORAGE_KEY,
  buildCoachIntervention,
  buildDemoIntervention,
  chooseCoachInterventionLevel,
  listCoachEngineEvents,
  listCoachInterventionActionLog,
  pushCoachEngineEvent,
  recordCoachInterventionAction,
  subscribeCoachEngine
} from '../services/coachInterventionService';

describe('coachInterventionService', () => {
  beforeEach(() => {
    localStorage.removeItem(COACH_ENGINE_STORAGE_KEY);
    localStorage.removeItem(COACH_INTERVENTION_ACTION_LOG_KEY);
  });

  it('builds a firm demo intervention from CoachEngine metrics', () => {
    const intervention = buildDemoIntervention();
    expect(intervention.source).toBe('coach-engine');
    expect(intervention.type).toBe(COACH_ENGINE_EVENT_TYPES.APPROVAL_THEATER);
    expect(intervention.level).toBe(COACH_INTERVENTION_LEVELS.HARD);
    expect(intervention.message).toContain('approval theater detected');
    expect(intervention.localOnly).toBe(true);
  });

  it('escalates approval theater to hard pauses', () => {
    const intervention = buildCoachIntervention({
      type: COACH_ENGINE_EVENT_TYPES.APPROVAL_THEATER,
      severity: 'critical',
      metrics: { count: 5, action: 'publish_post', agent: 'miya', hoursAgo: 2 }
    });
    expect(intervention.level).toBe(COACH_INTERVENTION_LEVELS.HARD);

    const intervention2 = buildCoachIntervention({
      type: COACH_ENGINE_EVENT_TYPES.REPEATED_PIPELINE_FAILURE,
      severity: 'warning',
      metrics: { count: 3, action: 'research', agent: 'hector', hoursAgo: 1 }
    });
    expect(intervention2.level).toBe(COACH_INTERVENTION_LEVELS.FIRM);
  });

  it('keeps neutral events as quiet nudges', () => {
    const intervention = buildCoachIntervention({
      type: COACH_ENGINE_EVENT_TYPES.LONG_UNBROKEN_SESSION,
      severity: 'neutral',
      metrics: { count: 1, hoursAgo: 2, action: '', agent: '', rateDrop: '' }
    });
    expect(intervention.level).toBe(COACH_INTERVENTION_LEVELS.QUIET);
    expect(intervention.message).toContain('Heads up');
  });

  it('bridges CoachEngine JSON into a stored CoachInterventionCard payload', () => {
    const listener = vi.fn();
    window.addEventListener(COACH_ENGINE_EVENT, listener);

    const bridgeEvent = pushCoachEngineEvent({
      id: 'ce-1',
      type: COACH_ENGINE_EVENT_TYPES.APPROVAL_THEATER,
      severity: 'critical',
      metrics: { count: 5, action: 'publish_post', agent: 'miya', hoursAgo: 2 }
    });

    expect(bridgeEvent.intervention.level).toBe(COACH_INTERVENTION_LEVELS.HARD);
    expect(listCoachEngineEvents()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(COACH_ENGINE_EVENT, listener);
  });

  it('subscribes to local bridge events and records local-only action choices', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeCoachEngine(subscriber);
    const bridgeEvent = pushCoachEngineEvent({ metrics: { count: 12 } });

    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({ intervention: bridgeEvent.intervention }));

    const entry = recordCoachInterventionAction(bridgeEvent.intervention, 'pause_60_seconds', { durationMs: 60000 });
    expect(entry.localOnly).toBe(true);
    expect(listCoachInterventionActionLog()).toContainEqual(expect.objectContaining({ action: 'pause_60_seconds' }));

    unsubscribe();
  });
});