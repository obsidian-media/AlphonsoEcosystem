import {
  AGENT_PAIRINGS_V1,
  AGENT_PAIRING_ROUTES,
  PAIRING_SCOPE
} from '../services/agentPairingConstants';
import {
  resolveAgentPairingRoute,
  listAvailablePairings,
  isAgentPairingRoute
} from '../services/agentPairingRegistryService';

describe('agentPairingConstants', () => {
  describe('AGENT_PAIRINGS_V1', () => {
    it('defines exactly 4 pairing IDs', () => {
      const keys = Object.keys(AGENT_PAIRINGS_V1);
      expect(keys).toHaveLength(4);
    });

    it('has string values in from->to format', () => {
      Object.values(AGENT_PAIRINGS_V1).forEach((value) => {
        expect(value).toMatch(/^[a-z]+->[a-z]+$/);
      });
    });

    it('includes MIYA_COMFYUI', () => {
      expect(AGENT_PAIRINGS_V1.MIYA_COMFYUI).toBe('miya->comfyui');
    });

    it('includes JOSE_MIYA', () => {
      expect(AGENT_PAIRINGS_V1.JOSE_MIYA).toBe('jose->miya');
    });

    it('includes MIYA_MARIA', () => {
      expect(AGENT_PAIRINGS_V1.MIYA_MARIA).toBe('miya->maria');
    });

    it('includes MARIA_JOSE', () => {
      expect(AGENT_PAIRINGS_V1.MARIA_JOSE).toBe('maria->jose');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(AGENT_PAIRINGS_V1)).toBe(true);
    });
  });

  describe('AGENT_PAIRING_ROUTES', () => {
    it('has a route entry for each pairing ID', () => {
      Object.values(AGENT_PAIRINGS_V1).forEach((pairingId) => {
        expect(AGENT_PAIRING_ROUTES[pairingId]).toBeDefined();
      });
    });

    it('each route has from, to, type, approvalMode, riskLevel', () => {
      Object.values(AGENT_PAIRING_ROUTES).forEach((route) => {
        expect(typeof route.from).toBe('string');
        expect(typeof route.to).toBe('string');
        expect(typeof route.type).toBe('string');
        expect(typeof route.approvalMode).toBe('string');
        expect(typeof route.riskLevel).toBe('string');
      });
    });

    it('each route type is a valid category', () => {
      const validTypes = ['generation_request', 'task_delegation', 'content_handoff', 'status_report'];
      Object.values(AGENT_PAIRING_ROUTES).forEach((route) => {
        expect(validTypes).toContain(route.type);
      });
    });

    it('each route riskLevel is low', () => {
      Object.values(AGENT_PAIRING_ROUTES).forEach((route) => {
        expect(route.riskLevel).toBe('low');
      });
    });

    it('each route approvalMode is auto', () => {
      Object.values(AGENT_PAIRING_ROUTES).forEach((route) => {
        expect(route.approvalMode).toBe('auto');
      });
    });

    it('is frozen', () => {
      expect(Object.isFrozen(AGENT_PAIRING_ROUTES)).toBe(true);
    });
  });

  describe('PAIRING_SCOPE', () => {
    it('equals agent_pairings_v1', () => {
      expect(PAIRING_SCOPE).toBe('agent_pairings_v1');
    });
  });
});

describe('agentPairingRegistryService', () => {
  describe('resolveAgentPairingRoute', () => {
    it('returns route for valid pairing ID', () => {
      const route = resolveAgentPairingRoute(AGENT_PAIRINGS_V1.MIYA_COMFYUI);
      expect(route).toBeDefined();
      expect(route.from).toBe('miya');
      expect(route.to).toBe('comfyui');
    });

    it('returns null for unknown pairing ID', () => {
      expect(resolveAgentPairingRoute('unknown->route')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveAgentPairingRoute('')).toBeNull();
    });
  });

  describe('listAvailablePairings', () => {
    it('returns an array of 4 pairings', () => {
      const pairings = listAvailablePairings();
      expect(pairings).toHaveLength(4);
    });

    it('each pairing has id, from, to, type, approvalMode, riskLevel', () => {
      const pairings = listAvailablePairings();
      pairings.forEach((p) => {
        expect(typeof p.id).toBe('string');
        expect(typeof p.from).toBe('string');
        expect(typeof p.to).toBe('string');
        expect(typeof p.type).toBe('string');
        expect(typeof p.approvalMode).toBe('string');
        expect(typeof p.riskLevel).toBe('string');
      });
    });

    it('from/to match the route', () => {
      const pairings = listAvailablePairings();
      const miyaComfyui = pairings.find((p) => p.from === 'miya' && p.to === 'comfyui');
      expect(miyaComfyui).toBeDefined();
      expect(miyaComfyui.type).toBe('generation_request');
    });
  });

  describe('isAgentPairingRoute', () => {
    it('returns true for valid pairing', () => {
      expect(isAgentPairingRoute(AGENT_PAIRINGS_V1.JOSE_MIYA)).toBe(true);
    });

    it('returns false for unknown pairing', () => {
      expect(isAgentPairingRoute('bogus->route')).toBe(false);
    });
  });
});
