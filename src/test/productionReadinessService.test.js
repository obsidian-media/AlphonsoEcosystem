import { describe, expect, it } from 'vitest';
import { getProductionReadinessStateLabel, summarizeProductionReadiness } from '../services/productionReadinessService';

describe('productionReadinessService', () => {
  it('summarizes the readiness report without inventing a ready state', () => {
    const summary = summarizeProductionReadiness({
      overallState: 'partial',
      blockedCount: 2,
      issueCount: 4,
      needsSetupCount: 3,
      durabilityRows: [
        { id: 'workflow_durability', state: 'partial' }
      ],
      releaseState: { state: 'setup_required' }
    });

    expect(summary).toEqual({
      overallState: 'partial',
      blockerCount: 2,
      issueCount: 4,
      needsSetupCount: 3,
      workflowReady: 'partial',
      releaseReady: 'setup_required'
    });
  });

  it('keeps foundation_only as its own truth label', () => {
    expect(getProductionReadinessStateLabel('foundation_only')).toBe('foundation_only');
    expect(summarizeProductionReadiness({
      overallState: 'foundation_only',
      blockedCount: 0,
      issueCount: 0,
      needsSetupCount: 0,
      durabilityRows: [
        { id: 'workflow_durability', state: 'foundation_only' }
      ],
      releaseState: { state: 'setup_required' }
    })).toEqual({
      overallState: 'foundation_only',
      blockerCount: 0,
      issueCount: 0,
      needsSetupCount: 0,
      workflowReady: 'foundation_only',
      releaseReady: 'setup_required'
    });
  });
});
