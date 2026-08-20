import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataHydration } from '../../hooks/useDataHydration';
import { mockInvoke, setupTauriInvokeMock, resetTauriMocks } from '../../test/tauri-mock';
import { TRUST_STATES, timestampMs } from '../../services/trustModel';

vi.mock('../../services/memoryService', () => ({
  hydrateMemoryFromDurable: vi.fn(),
  listMemoryItems: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/connectors/connectorAuth', () => ({
  hydrateConnectorCredentialsFromSqlite: vi.fn()
}));

vi.mock('../../services/pluginRegistryService', () => ({
  discoverDiskPluginManifests: vi.fn(),
  listPlugins: vi.fn().mockReturnValue([]),
  listPluginAudit: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/verificationService', () => ({
  readDurableAuditLog: vi.fn(),
  getVerificationLogs: vi.fn().mockReturnValue([])
}));

vi.mock('../../services/runtimeLedgerService', () => ({
  bootstrapRuntimeLedgerHydration: vi.fn()
}));

import { hydrateMemoryFromDurable, listMemoryItems } from '../../services/memoryService';
import { hydrateConnectorCredentialsFromSqlite } from '../../services/connectors/connectorAuth';
import { discoverDiskPluginManifests, listPlugins, listPluginAudit } from '../../services/pluginRegistryService';
import { readDurableAuditLog, getVerificationLogs } from '../../services/verificationService';
import { bootstrapRuntimeLedgerHydration } from '../../services/runtimeLedgerService';

const createMockSettingsWithDefaults = (overrides = {}) => ({
  workspaceRoot: 'C:\\workspace',
  approvalMode: false,
  zeroCostMode: true,
  safeMode: true,
  localOnlyMode: true,
  previewMode: true,
  ...overrides
});

const createMockDesktopBridge = (overrides = {}) => ({
  state: 'connected',
  ...overrides
});

const mockSetters = () => ({
  setVerificationLogs: vi.fn(),
  setDurableAuditLogs: vi.fn(),
  setDiskPluginManifests: vi.fn(),
  setMemoryItems: vi.fn(),
  setPlugins: vi.fn(),
  setPluginAudit: vi.fn()
});

describe('useDataHydration', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetTauriMocks();
    setupTauriInvokeMock({});

    readDurableAuditLog.mockResolvedValue([
      { id: 'audit-1', type: 'test', timestamp: timestampMs() }
    ]);
    discoverDiskPluginManifests.mockResolvedValue([
      { id: 'plugin-1', name: 'Test Plugin' }
    ]);
    hydrateConnectorCredentialsFromSqlite.mockResolvedValue(undefined);
    hydrateMemoryFromDurable.mockResolvedValue([
      { id: 'mem-1', category: 'test', content: 'test memory' }
    ]);
    bootstrapRuntimeLedgerHydration.mockResolvedValue({ available: true, hydrated: [] });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial data load sequence', () => {
    it('loads audit logs and plugin manifests in first deferred effect', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { result } = renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(readDurableAuditLog).toHaveBeenCalledWith(200);
      expect(discoverDiskPluginManifests).toHaveBeenCalledWith(settings.workspaceRoot);
      expect(setters.setDurableAuditLogs).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'audit-1' })])
      );
      expect(setters.setDiskPluginManifests).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'plugin-1' })])
      );
    });

    it('handles audit log read failure gracefully (does not call setter on error)', async () => {
      readDurableAuditLog.mockRejectedValueOnce(new Error('DB locked'));
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(readDurableAuditLog).toHaveBeenCalled();
      // Promise.all fails fast, so neither setter is called
      expect(setters.setDurableAuditLogs).not.toHaveBeenCalled();
      expect(setters.setDiskPluginManifests).not.toHaveBeenCalled();
    });

    it('handles plugin manifest discovery failure gracefully (does not call setter on error)', async () => {
      discoverDiskPluginManifests.mockRejectedValueOnce(new Error('FS error'));
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(discoverDiskPluginManifests).toHaveBeenCalled();
      // Promise.all fails fast, so neither setter is called
      expect(setters.setDurableAuditLogs).not.toHaveBeenCalled();
      expect(setters.setDiskPluginManifests).not.toHaveBeenCalled();
    });

    it('continues loading other modules when first effect fails', async () => {
      // First effect (audit + manifests) fails
      readDurableAuditLog.mockRejectedValueOnce(new Error('Audit DB error'));
      // But subsequent effects run independently
      discoverDiskPluginManifests.mockResolvedValue([{ id: 'plugin-1' }]);
      hydrateMemoryFromDurable.mockResolvedValue([{ id: 'mem-1' }]);
      bootstrapRuntimeLedgerHydration.mockResolvedValue({ available: true, hydrated: [] });
      
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      // Advance past all timers (audit at 2000ms, credentials at 500ms, memory at 3000ms, ledger at 4000ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // discoverDiskPluginManifests is in the same Promise.all as audit, so it also fails
      // But hydrateMemoryFromDurable and bootstrapRuntimeLedgerHydration run in separate effects
      expect(setters.setMemoryItems).toHaveBeenCalledWith([{ id: 'mem-1' }]);
    });
  });

  describe('Connector credential hydration', () => {
    it('hydrates connector credentials from SQLite with force flag', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(hydrateConnectorCredentialsFromSqlite).toHaveBeenCalledWith(true);
    });

    it('handles credential hydration failure gracefully', async () => {
      hydrateConnectorCredentialsFromSqlite.mockRejectedValueOnce(new Error('DB error'));
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(hydrateConnectorCredentialsFromSqlite).toHaveBeenCalled();
    });
  });

  describe('Memory hydration from durable storage', () => {
    it('hydrates memory items from durable storage when not coach window', async () => {
      const durableRows = [
        { id: 'mem-1', category: 'test', content: 'memory 1' },
        { id: 'mem-2', category: 'runtime', content: 'memory 2' }
      ];
      hydrateMemoryFromDurable.mockResolvedValue(durableRows);

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });

      expect(hydrateMemoryFromDurable).toHaveBeenCalled();
      expect(setters.setMemoryItems).toHaveBeenCalledWith(durableRows);
    });

    it('skips memory hydration for coach window', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: true, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });

      expect(hydrateMemoryFromDurable).not.toHaveBeenCalled();
    });

    it('handles empty memory results gracefully (does not call setter)', async () => {
      hydrateMemoryFromDurable.mockResolvedValue([]);
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });

      expect(setters.setMemoryItems).not.toHaveBeenCalled();
    });

    it('handles memory hydration failure gracefully', async () => {
      hydrateMemoryFromDurable.mockRejectedValueOnce(new Error('Memory DB error'));
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });

      expect(hydrateMemoryFromDurable).toHaveBeenCalled();
      expect(setters.setMemoryItems).not.toHaveBeenCalled();
    });
  });

  describe('Runtime ledger hydration', () => {
    it('hydrates runtime ledger with all scope mappings', async () => {
      const proof = { available: true, hydrated: ['packet-1', 'command-1'] };
      bootstrapRuntimeLedgerHydration.mockResolvedValue(proof);

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });

      // The actual scopes use storageKey as the scope value
      expect(bootstrapRuntimeLedgerHydration).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ scope: 'agent_bus_packets_v1' }),
          expect.objectContaining({ scope: 'jose_command_routes_v2' })
        ])
      );
    });

    it('updates all state from ledger hydration proof', async () => {
      const proof = { available: true, hydrated: ['packet-1'] };
      bootstrapRuntimeLedgerHydration.mockResolvedValue(proof);
      getVerificationLogs.mockReturnValue([{ id: 'vlog-1' }]);
      listPlugins.mockReturnValue([{ id: 'plug-1' }]);
      listPluginAudit.mockReturnValue([{ id: 'audit-1' }]);
      listMemoryItems.mockReturnValue([{ id: 'mem-1' }]);

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });

      expect(setters.setVerificationLogs).toHaveBeenCalledWith([{ id: 'vlog-1' }]);
      expect(setters.setPlugins).toHaveBeenCalledWith([{ id: 'plug-1' }]);
      expect(setters.setPluginAudit).toHaveBeenCalledWith([{ id: 'audit-1' }]);
      expect(setters.setMemoryItems).toHaveBeenCalledWith([{ id: 'mem-1' }]);
    });

    it('skips ledger hydration for coach window', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: true, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });

      expect(bootstrapRuntimeLedgerHydration).not.toHaveBeenCalled();
    });

    it('handles unavailable ledger gracefully', async () => {
      bootstrapRuntimeLedgerHydration.mockResolvedValue({ available: false });
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });

      expect(setters.setVerificationLogs).not.toHaveBeenCalled();
    });

    it('handles ledger hydration failure gracefully', async () => {
      bootstrapRuntimeLedgerHydration.mockRejectedValueOnce(new Error('Ledger error'));
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });

      expect(bootstrapRuntimeLedgerHydration).toHaveBeenCalled();
    });
  });

  describe('Staggered loading and cancellation', () => {
    it('staggered loading: credentials (500ms), audit (2000ms), memory (3000ms), ledger (4000ms)', async () => {
      const callOrder = [];
      readDurableAuditLog.mockImplementation(async () => { callOrder.push('audit'); return []; });
      hydrateConnectorCredentialsFromSqlite.mockImplementation(async () => { callOrder.push('credentials'); });
      hydrateMemoryFromDurable.mockImplementation(async () => { callOrder.push('memory'); return []; });
      bootstrapRuntimeLedgerHydration.mockImplementation(async () => { callOrder.push('ledger'); return { available: true }; });

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Credentials (500ms) fires first, then audit (2000ms), then memory (3000ms), then ledger (4000ms)
      expect(callOrder).toEqual(['credentials', 'audit', 'memory', 'ledger']);
    });

    it('cancels in-flight requests on unmount', async () => {
      let resolveAudit;
      readDurableAuditLog.mockImplementation(() => new Promise(r => { resolveAudit = r; }));

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { unmount } = renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      unmount();
      resolveAudit?.([]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(readDurableAuditLog).toHaveBeenCalled();
    });

    it('does not execute effects after unmount', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      const { unmount } = renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(hydrateMemoryFromDurable).not.toHaveBeenCalled();
      expect(bootstrapRuntimeLedgerHydration).not.toHaveBeenCalled();
    });
  });

  describe('Error boundary integration', () => {
    it('continues other hydrations when one throws', async () => {
      // First effect (audit + manifests) fails
      readDurableAuditLog.mockRejectedValueOnce(new Error('Audit fail'));
      // Second effect (credentials) fails
      hydrateConnectorCredentialsFromSqlite.mockRejectedValueOnce(new Error('Cred fail'));
      // Third effect (memory) succeeds
      hydrateMemoryFromDurable.mockResolvedValue([{ id: 'mem-1' }]);
      // Fourth effect (ledger) succeeds
      bootstrapRuntimeLedgerHydration.mockResolvedValue({ available: true });

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      // Advance past all timers
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      // Memory hydration runs in a separate effect, so it succeeds
      expect(setters.setMemoryItems).toHaveBeenCalledWith([{ id: 'mem-1' }]);
    });
  });

  describe('Selective hydration for current view', () => {
    it('can hydrate only audit and manifests for dashboard view', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(readDurableAuditLog).toHaveBeenCalled();
      expect(discoverDiskPluginManifests).toHaveBeenCalled();
    });

    it('runs all hydrations regardless of desktop bridge state (they check internally)', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'disconnected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(hydrateMemoryFromDurable).toHaveBeenCalled();
      expect(bootstrapRuntimeLedgerHydration).toHaveBeenCalled();
    });
  });

  describe('Cache invalidation on schema change', () => {
    it('re-hydrates when workspace root changes', async () => {
      const settings1 = createMockSettingsWithDefaults({ workspaceRoot: 'C:\\ws1' });
      const settings2 = createMockSettingsWithDefaults({ workspaceRoot: 'C:\\ws2' });
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { rerender } = renderHook(
        ({ settings }) => useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters }),
        { initialProps: { settings: settings1 } }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(discoverDiskPluginManifests).toHaveBeenCalledWith('C:\\ws1');

      discoverDiskPluginManifests.mockClear();

      rerender({ settings: settings2 });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(discoverDiskPluginManifests).toHaveBeenCalledWith('C:\\ws2');
    });

    it('hydrates connector credentials only on mount (empty dependency array)', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge1 = createMockDesktopBridge({ state: 'connected' });
      const desktopBridge2 = createMockDesktopBridge({ state: 'disconnected' });
      const setters = mockSetters();

      const { rerender } = renderHook(
        ({ desktopBridge }) => useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters }),
        { initialProps: { desktopBridge: desktopBridge1 } }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(hydrateConnectorCredentialsFromSqlite).toHaveBeenCalledTimes(1);

      hydrateConnectorCredentialsFromSqlite.mockClear();

      rerender({ desktopBridge: desktopBridge2 });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      // Credential hydration only runs on mount (empty deps), not on bridge state change
      expect(hydrateConnectorCredentialsFromSqlite).toHaveBeenCalledTimes(0);
    });
  });

  describe('Post-hydration validation', () => {
    it('validates audit log structure after hydration', async () => {
      readDurableAuditLog.mockResolvedValue([
        { id: '1', type: 'valid', timestamp: timestampMs() },
        { id: '2', type: 'valid', timestamp: timestampMs() }
      ]);

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(setters.setDurableAuditLogs).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: '1', type: 'valid' }),
          expect.objectContaining({ id: '2', type: 'valid' })
        ])
      );
    });

    it('validates plugin manifest structure', async () => {
      discoverDiskPluginManifests.mockResolvedValue([
        { id: 'p1', name: 'Plugin 1', manifest: { version: '1.0' } }
      ]);

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(setters.setDiskPluginManifests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'p1', name: 'Plugin 1' })
        ])
      );
    });

    it('filters out invalid memory items', async () => {
      hydrateMemoryFromDurable.mockResolvedValue([
        { id: 'm1', category: 'valid', content: 'ok' },
        { id: 'm2', category: 'invalid' }, // missing content
        { category: 'no-id' } // missing id
      ]);

      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge({ state: 'connected' });
      const setters = mockSetters();

      renderHook(() =>
        useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });

      expect(setters.setMemoryItems).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'm1', category: 'valid', content: 'ok' })
        ])
      );
    });
  });

  describe('Background refresh for stale data', () => {
    it('re-runs audit and manifest loading on settings change', async () => {
      const settings = createMockSettingsWithDefaults();
      const desktopBridge = createMockDesktopBridge();
      const setters = mockSetters();

      const { rerender } = renderHook(
        ({ settings }) => useDataHydration({ settings, desktopBridge, isCoachWindow: false, ...setters }),
        { initialProps: { settings } }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(readDurableAuditLog).toHaveBeenCalledTimes(1);

      rerender({ settings: { ...settings, workspaceRoot: 'C:\\new' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(readDurableAuditLog).toHaveBeenCalledTimes(2);
    });
  });
});