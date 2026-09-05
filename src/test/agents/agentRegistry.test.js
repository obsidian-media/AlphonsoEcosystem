import { describe, it, expect } from 'vitest';
import { CORE_AGENT_REGISTRY, listAgentProfiles, getAgentProfile } from '../../agents/agentRegistry';

describe('agentRegistry', () => {
  describe('CORE_AGENT_REGISTRY', () => {
    it('has 9 agents', () => {
      expect(CORE_AGENT_REGISTRY).toHaveLength(9);
    });

    it('contains Jose as first entry', () => {
      expect(CORE_AGENT_REGISTRY[0].id).toBe('jose');
    });

    it('contains Alphonso', () => {
      expect(CORE_AGENT_REGISTRY.find((a) => a.id === 'alphonso')).toBeDefined();
    });

    it('contains all expected agent ids', () => {
      const ids = CORE_AGENT_REGISTRY.map((a) => a.id);
      expect(ids).toEqual([
        'jose', 'alphonso', 'miya', 'hector', 'maria', 'marcus', 'echo', 'sentinel', 'nova',
      ]);
    });
  });

  describe('listAgentProfiles', () => {
    it('returns 9 agents', () => {
      const agents = listAgentProfiles();
      expect(agents).toHaveLength(9);
    });

    it('returns a new array reference (defensive copy)', () => {
      const a1 = listAgentProfiles();
      const a2 = listAgentProfiles();
      expect(a1).not.toBe(a2);
    });

    it('does not mutate the original registry', () => {
      const agents = listAgentProfiles();
      agents.push({ id: 'fake' });
      expect(CORE_AGENT_REGISTRY).toHaveLength(9);
    });

    it('each agent has an id property', () => {
      const agents = listAgentProfiles();
      for (const agent of agents) {
        expect(agent.id).toBeDefined();
        expect(typeof agent.id).toBe('string');
      }
    });
  });

  describe('getAgentProfile', () => {
    it('returns jose profile for jose', () => {
      const profile = getAgentProfile('jose');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('jose');
      expect(profile.name).toBe('Jose');
    });

    it('returns alphonso profile for alphonso', () => {
      const profile = getAgentProfile('alphonso');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('alphonso');
    });

    it('returns miya profile for miya', () => {
      const profile = getAgentProfile('miya');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('miya');
    });

    it('returns hector profile for hector', () => {
      const profile = getAgentProfile('hector');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('hector');
    });

    it('returns maria profile for maria', () => {
      const profile = getAgentProfile('maria');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('maria');
    });

    it('returns marcus profile for marcus', () => {
      const profile = getAgentProfile('marcus');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('marcus');
    });

    it('returns echo profile for echo', () => {
      const profile = getAgentProfile('echo');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('echo');
    });

    it('returns sentinel profile for sentinel', () => {
      const profile = getAgentProfile('sentinel');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('sentinel');
    });

    it('returns nova profile for nova', () => {
      const profile = getAgentProfile('nova');
      expect(profile).toBeDefined();
      expect(profile.id).toBe('nova');
    });

    it('returns null for nonexistent agent', () => {
      expect(getAgentProfile('nonexistent')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getAgentProfile('')).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(getAgentProfile(undefined)).toBeNull();
    });

    it('is case-sensitive', () => {
      expect(getAgentProfile('Jose')).toBeNull();
      expect(getAgentProfile('JOSE')).toBeNull();
    });
  });
});
