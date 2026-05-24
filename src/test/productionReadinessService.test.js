import { describe, expect, it } from 'vitest';
import { summarizeProductionReadiness } from '../services/productionReadinessService';

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
});
