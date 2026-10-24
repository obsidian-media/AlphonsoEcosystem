// Every workflow system gives each agent only work it owns (agent roles Part A, 2026-10-24).
import { describe, it, expect } from 'vitest';
import { listWorkflowOperations } from '../services/workflowOperationsRegistryService';
import { WORKFLOW_STEP_TASK } from '../services/workflowRegistryService';
import { ownerOf, AGENT_PERMISSION_TABLE } from '../services/jose/agentPermissionTable';

const AGENTS = new Set(Object.keys(AGENT_PERMISSION_TABLE));

describe('workflows obey the owners', () => {
  it("each agent-chain workflow step is its agent's own kind of work", () => {
    for (const [agent, type] of Object.entries(WORKFLOW_STEP_TASK)) expect(ownerOf(type), agent).toBe(agent);
  });

  it('the operations name only real agents or your approval stage', () => {
    for (const op of listWorkflowOperations()) {
      for (const stage of op.agentSequence) {
        expect(stage === 'user_approval' || AGENTS.has(stage), `${op.id}: ${stage}`).toBe(true);
      }
    }
  });
});
