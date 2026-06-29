import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../../lib/durableStore', () => ({
  durableGet: vi.fn(() => null),
  durableSet: vi.fn(),
  durableRemove: vi.fn(),
}));

import {
  getVerificationLogs,
  appendVerificationLog,
  verifyDurableAuditChain,
  verifyOllamaRuntimeProof,
  buildOllamaStartupGuide,
  verifyProcessProof,
  verifyPathProof,
  verifyCommandExecution
} from '../../services/verificationService';

describe('verificationService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  beforeEach(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.useFakeTimers();
  });

  describe('getVerificationLogs', () => {
    it('returns empty array when no logs stored', () => {
      expect(getVerificationLogs()).toEqual([]);
    });

    it('returns stored logs array', () => {
      localStorageMock.setItem('alphonso_verification_logs_v1', JSON.stringify([{id: '1'}]));
      expect(getVerificationLogs()).toEqual([{id: '1'}]);
    });

    it('returns empty on corrupt JSON', () => {
      localStorageMock.setItem('alphonso_verification_logs_v1', 'not-json');
      expect(getVerificationLogs()).toEqual([]);
    });
  });

  describe('appendVerificationLog', () => {
    it('appends log entry and returns payload', () => {
      const result = appendVerificationLog({ type: 'test', trust: 'verified' });
      expect(result).toHaveProperty('id');
      expect(result.type).toBe('test');
      expect(result.trust).toBe('verified');
    });
  });

  describe('buildOllamaStartupGuide', () => {
    it('returns needs_runtime when not connected', () => {
      const guide = buildOllamaStartupGuide({
        ollamaStatus: { state: 'disconnected' },
        models: [],
        selectedModel: ''
      });
      expect(guide.status).toBe('needs_runtime');
      expect(guide.title).toContain('Ollama');
    });

    it('returns needs_model when connected but no models', () => {
      const guide = buildOllamaStartupGuide({
        ollamaStatus: { state: 'connected' },
        models: [],
        selectedModel: ''
      });
      expect(guide.status).toBe('needs_model');
    });

    it('returns ready when connected and models exist', () => {
      const guide = buildOllamaStartupGuide({
        ollamaStatus: { state: 'connected' },
        models: [{ name: 'llama3.1' }],
        selectedModel: ''
      });
      expect(guide.status).toBe('ready');
      expect(guide.title).toContain('ready');
    });

    it('handles selected model not installed', () => {
      const guide = buildOllamaStartupGuide({
        ollamaStatus: { state: 'connected' },
        models: [{ name: 'llama3.1' }],
        selectedModel: 'nonexistent-model'
      });
      expect(guide.status).toBe('needs_model');
      expect(guide.command).toContain('nonexistent-model');
    });
  });
});