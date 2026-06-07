import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
}));

let storedOutputs = {};

beforeEach(() => {
  storedOutputs = {};
  localStorage.clear();
  localStorage.setItem('alphonso_agent_outputs_v1', JSON.stringify(storedOutputs));
  vi.clearAllMocks();
});

async function loadService() {
  return await import('../services/agentOutputStoreService');
}

describe('agentOutputStoreService', () => {
  describe('setAgentOutput', () => {
    it('stores output for a command and agent', async () => {
      const { setAgentOutput, getAgentOutput } = await loadService();
      const output = { summary: 'Hector research done', resultState: 'completed' };
      setAgentOutput('cmd-1', 'hector', output);
      const stored = getAgentOutput('cmd-1', 'hector');
      expect(stored).not.toBeNull();
      expect(stored.summary).toBe('Hector research done');
      expect(stored.agentName).toBe('hector');
      expect(stored.storedAtMs).toBeGreaterThan(0);
    });

    it('returns null for missing parameters', async () => {
      const { setAgentOutput } = await loadService();
      expect(setAgentOutput(null, 'hector', { summary: 'test' })).toBeNull();
      expect(setAgentOutput('cmd-1', null, { summary: 'test' })).toBeNull();
      expect(setAgentOutput('cmd-1', 'hector', null)).toBeNull();
    });

    it('overwrites previous output for same agent on same command', async () => {
      const { setAgentOutput, getAgentOutput } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'first' });
      setAgentOutput('cmd-1', 'hector', { summary: 'second' });
      const stored = getAgentOutput('cmd-1', 'hector');
      expect(stored.summary).toBe('second');
    });
  });

  describe('getAgentOutput', () => {
    it('returns null for non-existent command', async () => {
      const { getAgentOutput } = await loadService();
      expect(getAgentOutput('no-such-cmd', 'hector')).toBeNull();
    });

    it('returns null for non-existent agent', async () => {
      const { setAgentOutput, getAgentOutput } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'test' });
      expect(getAgentOutput('cmd-1', 'miya')).toBeNull();
    });

    it('returns null for missing parameters', async () => {
      const { getAgentOutput } = await loadService();
      expect(getAgentOutput(null, 'hector')).toBeNull();
      expect(getAgentOutput('cmd-1', null)).toBeNull();
    });
  });

  describe('getAllAgentOutputs', () => {
    it('returns all outputs for a command', async () => {
      const { setAgentOutput, getAllAgentOutputs } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'research' });
      setAgentOutput('cmd-1', 'miya', { summary: 'creative' });
      const all = getAllAgentOutputs('cmd-1');
      expect(Object.keys(all)).toHaveLength(2);
      expect(all.hector.summary).toBe('research');
      expect(all.miya.summary).toBe('creative');
    });

    it('returns empty object for non-existent command', async () => {
      const { getAllAgentOutputs } = await loadService();
      expect(getAllAgentOutputs('no-such-cmd')).toEqual({});
    });

    it('returns empty object for missing parameter', async () => {
      const { getAllAgentOutputs } = await loadService();
      expect(getAllAgentOutputs(null)).toEqual({});
    });
  });

  describe('getPriorOutputs', () => {
    it('returns outputs from dependency agents only', async () => {
      const { setAgentOutput, getPriorOutputs } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'research' });
      setAgentOutput('cmd-1', 'miya', { summary: 'creative' });
      setAgentOutput('cmd-1', 'maria', { summary: 'governance' });
      const priorForMiya = getPriorOutputs('cmd-1', 'miya');
      expect(Object.keys(priorForMiya)).toEqual(['hector']);
      expect(priorForMiya.hector.summary).toBe('research');
    });

    it('returns empty object for agents with no dependencies', async () => {
      const { setAgentOutput, getPriorOutputs } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'research' });
      expect(getPriorOutputs('cmd-1', 'hector')).toEqual({});
    });

    it('returns multiple prior outputs for agents with multiple deps', async () => {
      const { setAgentOutput, getPriorOutputs } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'research' });
      setAgentOutput('cmd-1', 'miya', { summary: 'creative' });
      setAgentOutput('cmd-1', 'maria', { summary: 'governance' });
      const priorForEcho = getPriorOutputs('cmd-1', 'echo');
      expect(Object.keys(priorForEcho).length).toBeGreaterThanOrEqual(3);
      expect(priorForEcho.hector).toBeDefined();
      expect(priorForEcho.miya).toBeDefined();
      expect(priorForEcho.maria).toBeDefined();
    });

    it('returns empty object for missing parameters', async () => {
      const { getPriorOutputs } = await loadService();
      expect(getPriorOutputs(null, 'miya')).toEqual({});
      expect(getPriorOutputs('cmd-1', null)).toEqual({});
    });

    it('returns empty object when dependency has not stored output', async () => {
      const { getPriorOutputs } = await loadService();
      expect(getPriorOutputs('cmd-1', 'miya')).toEqual({});
    });
  });

  describe('clearAgentOutputs', () => {
    it('removes all outputs for a command', async () => {
      const { setAgentOutput, clearAgentOutputs, getAllAgentOutputs } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'research' });
      setAgentOutput('cmd-1', 'miya', { summary: 'creative' });
      clearAgentOutputs('cmd-1');
      expect(getAllAgentOutputs('cmd-1')).toEqual({});
    });

    it('does not affect other commands', async () => {
      const { setAgentOutput, clearAgentOutputs, getAllAgentOutputs } = await loadService();
      setAgentOutput('cmd-1', 'hector', { summary: 'research' });
      setAgentOutput('cmd-2', 'miya', { summary: 'creative' });
      clearAgentOutputs('cmd-1');
      expect(getAllAgentOutputs('cmd-2').miya).toBeDefined();
    });

    it('handles missing parameter gracefully', async () => {
      const { clearAgentOutputs } = await loadService();
      expect(() => clearAgentOutputs(null)).not.toThrow();
    });
  });

  describe('buildExecutionPlan', () => {
    it('returns empty plan for empty assignments', async () => {
      const { buildExecutionPlan } = await loadService();
      const plan = buildExecutionPlan([]);
      expect(plan.waves).toEqual([]);
      expect(plan.assignmentMap).toEqual({});
    });

    it('returns null for null input', async () => {
      const { buildExecutionPlan } = await loadService();
      const plan = buildExecutionPlan(null);
      expect(plan.waves).toEqual([]);
    });

    it('groups independent agents into wave 0', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'hector', actionType: 'research' },
        { agent: 'maria', actionType: 'governance_audit' },
        { agent: 'sentinel', actionType: 'security_monitor' },
        { agent: 'nova', actionType: 'opportunity_analysis' }
      ];
      const plan = buildExecutionPlan(assignments);
      expect(plan.waves).toHaveLength(1);
      expect(plan.waves[0]).toContain('hector');
      expect(plan.waves[0]).toContain('maria');
      expect(plan.waves[0]).toContain('sentinel');
      expect(plan.waves[0]).toContain('nova');
    });

    it('sequences miya after hector in separate waves', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'hector', actionType: 'research' },
        { agent: 'miya', actionType: 'creative_package' }
      ];
      const plan = buildExecutionPlan(assignments);
      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[0]).toContain('hector');
      expect(plan.waves[1]).toContain('miya');
    });

    it('builds a 3-wave chain: hector -> miya -> alphonso', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'hector', actionType: 'research' },
        { agent: 'miya', actionType: 'creative_package' },
        { agent: 'alphonso', actionType: 'local_operation' }
      ];
      const plan = buildExecutionPlan(assignments);
      expect(plan.waves).toHaveLength(3);
      expect(plan.waves[0]).toContain('hector');
      expect(plan.waves[1]).toContain('miya');
      expect(plan.waves[2]).toContain('alphonso');
    });

    it('runs maria and marcus in sequential waves', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'maria', actionType: 'governance_audit' },
        { agent: 'marcus', actionType: 'distribution_execution' }
      ];
      const plan = buildExecutionPlan(assignments);
      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[0]).toContain('maria');
      expect(plan.waves[1]).toContain('marcus');
    });

    it('echo goes in the last wave after all other agents', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'hector', actionType: 'research' },
        { agent: 'miya', actionType: 'creative_package' },
        { agent: 'alphonso', actionType: 'local_operation' },
        { agent: 'echo', actionType: 'memory_preservation' }
      ];
      const plan = buildExecutionPlan(assignments);
      const lastWave = plan.waves[plan.waves.length - 1];
      expect(lastWave).toContain('echo');
    });

    it('skips agents that are not in the assignment list', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'hector', actionType: 'research' },
        { agent: 'miya', actionType: 'creative_package' }
      ];
      const plan = buildExecutionPlan(assignments);
      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[0]).toEqual(['hector']);
      expect(plan.waves[1]).toEqual(['miya']);
    });

    it('populates assignmentMap correctly', async () => {
      const { buildExecutionPlan } = await loadService();
      const assignments = [
        { agent: 'hector', actionType: 'research' },
        { agent: 'miya', actionType: 'creative_package' }
      ];
      const plan = buildExecutionPlan(assignments);
      expect(plan.assignmentMap.hector.actionType).toBe('research');
      expect(plan.assignmentMap.miya.actionType).toBe('creative_package');
    });
  });

  describe('AGENT_DEPENDENCIES', () => {
    it('defines correct dependencies for key agents', async () => {
      const { AGENT_DEPENDENCIES } = await loadService();
      expect(AGENT_DEPENDENCIES.hector).toEqual([]);
      expect(AGENT_DEPENDENCIES.maria).toEqual([]);
      expect(AGENT_DEPENDENCIES.sentinel).toEqual([]);
      expect(AGENT_DEPENDENCIES.nova).toEqual([]);
      expect(AGENT_DEPENDENCIES.jose).toEqual([]);
      expect(AGENT_DEPENDENCIES.miya).toEqual(['hector']);
      expect(AGENT_DEPENDENCIES.alphonso).toEqual(['miya']);
      expect(AGENT_DEPENDENCIES.marcus).toEqual(['maria']);
      expect(AGENT_DEPENDENCIES.echo).toContain('hector');
      expect(AGENT_DEPENDENCIES.echo).toContain('miya');
      expect(AGENT_DEPENDENCIES.echo).toContain('maria');
      expect(AGENT_DEPENDENCIES.echo).toContain('marcus');
    });
  });
});
