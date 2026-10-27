import { describe, it, expect } from 'vitest';

import { resolveAgentPairingRoute, listAvailablePairings, isAgentPairingRoute } from '../../services/agentPairingRegistryService';

describe('agentPairingRegistryService', () => {
  describe('resolveAgentPairingRoute', () => {
    it('returns route object for valid pairing id', () => {
      const route = resolveAgentPairingRoute('miya->comfyui');
      expect(route).toBeTruthy();
      expect(route.from).toBe('miya');
      expect(route.to).toBe('comfyui');
    });
    it('returns route with type field', () => {
      const route = resolveAgentPairingRoute('jose->miya');
      expect(route.type).toBe('task_delegation');
    });
    it('returns null for unknown pairing id', () => {
      expect(resolveAgentPairingRoute('unknown->pair')).toBeNull();
    });
    it('returns null for empty string', () => {
      expect(resolveAgentPairingRoute('')).toBeNull();
    });
  });

  describe('listAvailablePairings', () => {
    it('returns array of pairings', () => {
      const pairings = listAvailablePairings();
      expect(Array.isArray(pairings)).toBe(true);
      expect(pairings.length).toBeGreaterThanOrEqual(10);
    });
    it('each pairing has required fields', () => {
      const pairings = listAvailablePairings();
      for (const pairing of pairings) {
        expect(typeof pairing.from).toBe('string');
        expect(typeof pairing.to).toBe('string');
        expect(typeof pairing.type).toBe('string');
        expect(typeof pairing.approvalMode).toBe('string');
        expect(typeof pairing.riskLevel).toBe('string');
      }
    });
    it('includes maria->marcus governance pairing', () => {
      const pairings = listAvailablePairings();
      const mariaMarcus = pairings.find(p => p.from === 'maria' && p.to === 'marcus');
      expect(mariaMarcus).toBeTruthy();
      expect(mariaMarcus!.approvalMode).toBe('manual');
      expect(mariaMarcus!.riskLevel).toBe('medium');
    });
  });

  describe('isAgentPairingRoute', () => {
    it('returns true for valid pairing id', () => {
      expect(isAgentPairingRoute('miya->comfyui')).toBe(true);
    });
    it('returns true for all known pairings', () => {
      const pairings = listAvailablePairings();
      for (const pairing of pairings) {
        const id = `${pairing.from}->${pairing.to}`;
        expect(isAgentPairingRoute(id)).toBe(true);
      }
    });
    it('returns false for unknown pairing id', () => {
      expect(isAgentPairingRoute('unknown->pair')).toBe(false);
    });
    it('returns false for empty string', () => {
      expect(isAgentPairingRoute('')).toBe(false);
    });
  });
});
