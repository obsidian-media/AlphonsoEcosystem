import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

vi.mock('../../services/licenseService', () => ({
  canUseConnector: vi.fn((id: string) => {
    const free = ['ollama', 'telegram', 'brave_search'];
    return free.includes(id);
  })
}));

import {
  getRuntimePolicySettings,
  classifyConnectorRisk,
  evaluatePolicyGate,
  setRuntimePolicySettings,
  type PolicyGateInput
} from '../../services/policyEnforcementService';

describe('policyEnforcementService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.clearAllMocks();
  });

  describe('getRuntimePolicySettings', () => {
    it('returns safe defaults when no settings stored', () => {
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(false);
      expect(settings.zeroCostMode).toBe(true);
      expect(settings.safeMode).toBe(true);
      expect(settings.localOnlyMode).toBe(true);
      expect(settings.previewMode).toBe(true);
    });

    it('reads stored settings', () => {
      storage['alphonso_settings'] = JSON.stringify({
        approvalMode: true,
        zeroCostMode: false,
        safeMode: true,
        localOnlyMode: false,
        previewMode: true
      });
      const settings = getRuntimePolicySettings();
      expect(settings.approvalMode).toBe(true);
      expect(settings.zeroCostMode).toBe(false);
      expect(settings.localOnlyMode).toBe(false);
    });

    it('returns defaults on corrupt JSON', () => {
      storage['alphonso_settings'] = 'not-json';
      const settings = getRuntimePolicySettings();
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

    it('returns medium for chatgpt', () => {
      expect(classifyConnectorRisk('chatgpt')).toBe('medium');
    });

    it('returns medium for claude', () => {
      expect(classifyConnectorRisk('claude')).toBe('medium');
    });

    it('returns medium for github', () => {
      expect(classifyConnectorRisk('github')).toBe('medium');
    });

    it('returns medium for slack', () => {
      expect(classifyConnectorRisk('slack')).toBe('medium');
    });

    it('returns low for ollama', () => {
      expect(classifyConnectorRisk('ollama')).toBe('low');
    });

    it('returns high for publish action', () => {
      expect(classifyConnectorRisk('ollama', 'publish')).toBe('high');
    });

    it('returns high for upload action', () => {
      expect(classifyConnectorRisk('ollama', 'upload_video')).toBe('high');
    });

    it('returns low for unknown connector', () => {
      expect(classifyConnectorRisk('unknown')).toBe('low');
    });
  });

  describe('evaluatePolicyGate', () => {
    it('allows free connector in zero-cost mode', () => {
      const result = evaluatePolicyGate({ connectorId: 'ollama' });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks paid connector in zero-cost mode', () => {
      const result = evaluatePolicyGate({ connectorId: 'claude' });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Zero-Cost Mode');
    });

    it('allows paid connector when approved in zero-cost mode', () => {
      const result = evaluatePolicyGate({ connectorId: 'claude', approved: true });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks when approval mode requires approval', () => {
      storage['alphonso_settings'] = JSON.stringify({ approvalMode: true });
      // Use a high-risk connector (youtube) which triggers approval gate
      const result = evaluatePolicyGate({ connectorId: 'youtube', approved: false });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Approval Mode');
    });

    it('allows when approval mode and approved', () => {
      storage['alphonso_settings'] = JSON.stringify({ approvalMode: true });
      const result = evaluatePolicyGate({ connectorId: 'youtube', approved: true });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks when auth enabled but not authorized', () => {
      const result = evaluatePolicyGate({
        connectorId: 'ollama',
        auth: { enabled: true, isAuthorized: false }
      });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('authorization failed');
    });

    it('allows when auth enabled and authorized', () => {
      const result = evaluatePolicyGate({
        connectorId: 'ollama',
        auth: { enabled: true, isAuthorized: true }
      });
      expect(result.ok).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks premium connector when zero-cost mode disabled but no license', () => {
      // Disable zero-cost mode so the zero-cost gate doesn't fire
      storage['alphonso_settings'] = JSON.stringify({ zeroCostMode: false });
      const result = evaluatePolicyGate({ connectorId: 'chatgpt' });
      expect(result.ok).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Pro license');
    });

    it('returns correct risk level', () => {
      const result = evaluatePolicyGate({ connectorId: 'youtube' });
      expect(result.riskLevel).toBe('high');
    });

    it('returns verified confidence on success', () => {
      const result = evaluatePolicyGate({ connectorId: 'ollama' });
      expect(result.confidence).toBe('verified');
    });
  });

  describe('setRuntimePolicySettings', () => {
    it('merges settings with current', async () => {
      await setRuntimePolicySettings({ approvalMode: true });
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'alphonso_settings',
        expect.stringContaining('"approvalMode":true')
      );
    });

    it('preserves existing settings', async () => {
      storage['alphonso_settings'] = JSON.stringify({ zeroCostMode: false });
      await setRuntimePolicySettings({ approvalMode: true });
      const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(stored.zeroCostMode).toBe(false);
      expect(stored.approvalMode).toBe(true);
    });
  });
});
