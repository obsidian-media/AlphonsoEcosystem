import { describe, it, expect, beforeEach } from 'vitest';
import { classifyConnectorRisk, getRuntimePolicySettings, setRuntimePolicySettings } from '../services/policyEnforcementService';

describe('policyEnforcementService - caching integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('classifyConnectorRisk with caching', () => {
    it('returns high risk for youtube', () => {
      expect(classifyConnectorRisk('youtube')).toBe('high');
    });

    it('returns high risk for telegram', () => {
      expect(classifyConnectorRisk('telegram')).toBe('high');
    });

    it('returns high risk for whatsapp', () => {
      expect(classifyConnectorRisk('whatsapp')).toBe('high');
    });

    it('returns medium risk for github', () => {
      expect(classifyConnectorRisk('github')).toBe('medium');
    });

    it('returns medium risk for slack', () => {
      expect(classifyConnectorRisk('slack')).toBe('medium');
    });

    it('returns medium risk for chatgpt', () => {
      expect(classifyConnectorRisk('chatgpt')).toBe('medium');
    });

    it('returns medium risk for claude', () => {
      expect(classifyConnectorRisk('claude')).toBe('medium');
    });

    it('returns low risk for unknown connector', () => {
      expect(classifyConnectorRisk('unknown_connector')).toBe('low');
    });

    it('returns high risk for publish action', () => {
      expect(classifyConnectorRisk('any_connector', 'publish_video')).toBe('high');
    });

    it('returns high risk for upload action', () => {
      expect(classifyConnectorRisk('any_connector', 'upload_file')).toBe('high');
    });

    it('caches risk level on repeated calls', () => {
      const result1 = classifyConnectorRisk('github', 'create_issue');
      const result2 = classifyConnectorRisk('github', 'create_issue');
      expect(result1).toBe(result2);
      expect(result1).toBe('medium');
    });
  });

  describe('getRuntimePolicySettings with caching', () => {
    it('returns default settings when localStorage is empty', () => {
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(false);
      expect(settings.zeroCostMode).toBe(true);
      expect(settings.safeMode).toBe(true);
      expect(settings.localOnlyMode).toBe(true);
    });

    it('returns cached settings on repeated calls', () => {
      const settings1 = getRuntimePolicySettings();
      const settings2 = getRuntimePolicySettings();
      expect(settings1).toEqual(settings2);
    });

    it('reads settings from localStorage', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({
        approvalMode: false,
        zeroCostMode: false,
        safeMode: false,
        localOnlyMode: false
      }));
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(false);
      expect(settings.zeroCostMode).toBe(false);
      expect(settings.safeMode).toBe(false);
      expect(settings.localOnlyMode).toBe(false);
    });
  });

  describe('setRuntimePolicySettings invalidates cache', () => {
    it('updates settings and invalidates cache', async () => {
      await setRuntimePolicySettings({ approvalMode: false });
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(false);
    });
  });
});
