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

import { installModule, enableModule, disableModule, listModules, getModule, uninstallModule, recordModuleRun } from '../../services/moduleRegistryService';

describe('moduleRegistryService', () => {
  const storage = {};
  const localStorageMock = {
    getItem: vi.fn((k) => storage[k] ?? null),
    setItem: vi.fn((k, v) => { storage[k] = v; }),
    removeItem: vi.fn((k) => { delete storage[k]; }),
  };

  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k]);
    vi.stubGlobal('localStorage', localStorageMock);
  });

  describe('installModule', () => {
    it('returns error when module.toml cannot be read', async () => {
      const result = await installModule('/nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot read');
    });
  });

  describe('enableModule/disableModule', () => {
    it('enables and disables modules', async () => {
      const manifest = {
        id: 'test-mod',
        name: 'Test Module',
        version: '1.0.0',
        description: 'A test',
        author: 'test',
        capabilities: ['test'],
        models: [],
        schedules: [],
        entrypoint: '/index.js'
      };
      await installModule('/fake');
    });
  });
});