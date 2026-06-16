import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

import { bootstrapRuntimeLedgerHydration } from '../services/runtimeLedgerService';

describe('runtimeLedgerService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
  });

  it('hydrates runtime ledger rows back into localStorage after restart', async () => {
    invoke.mockImplementation(async (command) => {
      if (command === 'get_memory_store_status') {
        return { available: true };
      }
      if (command === 'list_runtime_ledger_records') {
        return [
          {
            id: 'row-1',
            data: { id: 'row-1', status: 'foundation_only', label: 'Local SD WebUI' },
            status: 'foundation_only',
            confidence: 'verified',
            verificationState: 'verified',
            timestampMs: 123
          }
        ];
      }
      return null;
    });

    const proof = await bootstrapRuntimeLedgerHydration([
      { scope: 'connector_registry_v2', storageKey: 'alphonso_connector_registry_v2' }
    ]);

    expect(proof).toEqual({
      available: true,
      loadedScopes: [
        { scope: 'connector_registry_v2', loaded: 1 }
      ]
    });
    expect(JSON.parse(localStorage.getItem('alphonso_connector_registry_v2'))).toEqual([
      { id: 'row-1', status: 'foundation_only', label: 'Local SD WebUI' }
    ]);
  });
});
