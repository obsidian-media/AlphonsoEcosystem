import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

const { getRuntimePolicySettings, classifyConnectorRisk, evaluatePolicyGate } = await import('../services/policyEnforcementService.js');

describe('policyEnforcementService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getRuntimePolicySettings', () => {
    it('returns all-true defaults when localStorage is empty', () => {
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(true);
      expect(settings.zeroCostMode).toBe(true);
      expect(settings.safeMode).toBe(true);
      expect(settings.localOnlyMode).toBe(true);
    });

    it('reads explicit false values from settings', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({
        approvalMode: false,
        zeroCostMode: false
      }));
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(false);
      expect(settings.zeroCostMode).toBe(false);
      expect(settings.safeMode).toBe(true);
      expect(settings.localOnlyMode).toBe(true);
    });

    it('returns defaults on corrupt JSON', () => {
      localStorage.setItem('alphonso_settings', 'not-json');
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(true);
      expect(settings.zeroCostMode).toBe(true);
    });
  });

  describe('classifyConnectorRisk', () => {
    it('returns high for youtube', () => {
      expect(classifyConnectorRisk('youtube')).toBe('high');
    });

    it('returns high for telegram', () => {
      expect(classifyConnectorRisk('telegram')).toBe('high');
    });

    it('returns high for whatsapp', () => {
      expect(classifyConnectorRisk('whatsapp')).toBe('high');
    });

    it('returns high for publish action', () => {
      expect(classifyConnectorRisk('notion', 'publish_content')).toBe('high');
    });

    it('returns high for upload action', () => {
      expect(classifyConnectorRisk('notion', 'upload_video')).toBe('high');
    });

    it('returns medium for chatgpt', () => {
      expect(classifyConnectorRisk('chatgpt')).toBe('medium');
    });

    it('returns medium for claude', () => {
      expect(classifyConnectorRisk('claude')).toBe('medium');
    });

    it('returns medium for notion', () => {
      expect(classifyConnectorRisk('notion')).toBe('medium');
    });

    it('returns medium for clickup', () => {
      expect(classifyConnectorRisk('clickup')).toBe('medium');
    });

    it('returns low for unknown connector', () => {
      expect(classifyConnectorRisk('unknown')).toBe('low');
    });

    it('returns low for empty id', () => {
      expect(classifyConnectorRisk('')).toBe('low');
    });

    it('returns low for null id', () => {
      expect(classifyConnectorRisk(null)).toBe('low');
    });
  });

  describe('evaluatePolicyGate', () => {
    it('blocks paid connectors in zero-cost mode', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'chatgpt' });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Zero-Cost Mode');
    });

    it('blocks whatsapp in zero-cost mode', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'whatsapp' });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('allows non-paid connectors in zero-cost mode', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true, approvalMode: false }));
      const result = evaluatePolicyGate({ connectorId: 'telegram' });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('allows paid connectors with approved override', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'chatgpt', approved: true });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks high-risk actions in approval mode', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'telegram', actionType: 'send_message' });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Approval Mode');
    });

    it('allows with approval in approval mode', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'telegram', actionType: 'send_message', approved: true });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks unauthorized auth', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: false }));
      const result = evaluatePolicyGate({
        connectorId: 'telegram',
        auth: { enabled: true, isAuthorized: false }
      });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('authorization failed');
    });

    it('allows authorized auth', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: false }));
      const result = evaluatePolicyGate({
        connectorId: 'telegram',
        auth: { enabled: true, isAuthorized: true }
      });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('returns full proof object on success', () => {
      const result = evaluatePolicyGate({ connectorId: 'telegram' });
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('blocked');
      expect(result).toHaveProperty('setupRequired');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('riskLevel');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('verificationState');
    });

    it('returns full proof object on blocked', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'chatgpt' });
      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('blocked');
      expect(result).toHaveProperty('setupRequired');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('riskLevel');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('verificationState');
    });

    it('blocks high-risk connector risk level in approval mode', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'youtube', approved: false });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('allows low-risk connector in approval mode without approval', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: true }));
      const result = evaluatePolicyGate({ connectorId: 'unknown_connector' });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });
  });
});
