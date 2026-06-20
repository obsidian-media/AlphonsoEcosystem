import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue(null);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => invoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../services/runtimeLedgerService.js', () => ({
  persistScopeRows: vi.fn()
}));

const {
  listPlugins,
  listPluginAudit,
  appendPluginAuditEntry,
  togglePlugin,
  discoverDiskPluginManifests,
  executePluginToolRun,
  validatePluginManifestDisk,
  PLUGIN_MANIFEST_FIELDS,
  PLUGINS_SCOPE,
  PLUGIN_AUDIT_SCOPE
} = await import('../services/pluginRegistryService.js');

describe('pluginRegistryService', () => {
  beforeEach(() => {
    localStorage.clear();
    invoke.mockReset();
    invoke.mockResolvedValue(null);
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('exports PLUGIN_MANIFEST_FIELDS as array', () => {
      expect(Array.isArray(PLUGIN_MANIFEST_FIELDS)).toBe(true);
      expect(PLUGIN_MANIFEST_FIELDS.length).toBeGreaterThan(0);
    });

    it('exports scope constants as strings', () => {
      expect(typeof PLUGINS_SCOPE).toBe('string');
      expect(typeof PLUGIN_AUDIT_SCOPE).toBe('string');
    });
  });

  describe('listPlugins', () => {
    it('returns default plugins when localStorage is empty', () => {
      const plugins = listPlugins();
      expect(plugins.length).toBeGreaterThan(0);
    });

    it('includes core.runtime-verifier by default', () => {
      const plugins = listPlugins();
      const ids = plugins.map((p) => p.id);
      expect(ids).toContain('core.runtime-verifier');
    });

    it('includes core.memory-ledger by default', () => {
      const plugins = listPlugins();
      const ids = plugins.map((p) => p.id);
      expect(ids).toContain('core.memory-ledger');
    });

    it('returns stored plugins when they exist', () => {
      const custom = [{ id: 'custom-1', name: 'Custom', version: '1.0.0', enabled: true, status: 'installed', trust: 'verified' }];
      localStorage.setItem('alphonso_plugins_v1', JSON.stringify(custom));
      const plugins = listPlugins();
      const ids = plugins.map((p) => p.id);
      expect(ids).toContain('custom-1');
    });

    it('merges missing defaults into stored plugins', () => {
      localStorage.setItem('alphonso_plugins_v1', JSON.stringify([]));
      const plugins = listPlugins();
      expect(plugins.length).toBeGreaterThan(0);
    });

    it('persists to localStorage', () => {
      listPlugins();
      const raw = localStorage.getItem('alphonso_plugins_v1');
      expect(raw).toBeTruthy();
    });

    it('returns plugins with expected fields', () => {
      const plugins = listPlugins();
      const plugin = plugins[0];
      expect(plugin).toHaveProperty('id');
      expect(plugin).toHaveProperty('name');
      expect(plugin).toHaveProperty('version');
      expect(plugin).toHaveProperty('enabled');
      expect(plugin).toHaveProperty('status');
      expect(plugin).toHaveProperty('permissions');
    });
  });

  describe('listPluginAudit', () => {
    it('returns empty array when no audit entries exist', () => {
      expect(listPluginAudit()).toEqual([]);
    });

    it('returns stored audit entries', () => {
      const entry = { id: 'audit-1', pluginId: 'test', action: 'enabled' };
      localStorage.setItem('alphonso_plugin_audit_v1', JSON.stringify([entry]));
      const audit = listPluginAudit();
      expect(audit).toHaveLength(1);
      expect(audit[0].id).toBe('audit-1');
    });
  });

  describe('appendPluginAuditEntry', () => {
    it('creates an audit entry with auto-generated id', () => {
      const entry = appendPluginAuditEntry({ pluginId: 'test-plugin', action: 'installed' });
      expect(entry.id).toMatch(/^audit-\d+-[a-f0-9]+$/);
    });

    it('stores pluginId and action', () => {
      const entry = appendPluginAuditEntry({ pluginId: 'p1', action: 'enabled' });
      expect(entry.pluginId).toBe('p1');
      expect(entry.action).toBe('enabled');
    });

    it('defaults pluginId to unknown', () => {
      const entry = appendPluginAuditEntry({});
      expect(entry.pluginId).toBe('unknown');
    });

    it('appends to existing audit entries', () => {
      appendPluginAuditEntry({ pluginId: 'a', action: 'event' });
      appendPluginAuditEntry({ pluginId: 'b', action: 'event' });
      const audit = listPluginAudit();
      expect(audit).toHaveLength(2);
    });

    it('caps audit entries at 300', () => {
      const entries = Array.from({ length: 300 }, (_, i) => ({ id: `e${i}`, pluginId: 'p', action: 'event' }));
      localStorage.setItem('alphonso_plugin_audit_v1', JSON.stringify(entries));
      appendPluginAuditEntry({ pluginId: 'overflow', action: 'event' });
      const audit = listPluginAudit();
      expect(audit.length).toBeLessThanOrEqual(300);
    });
  });

  describe('togglePlugin', () => {
    it('enables a plugin', () => {
      listPlugins();
      const updated = togglePlugin('core.runtime-verifier', true);
      const plugin = updated.find((p) => p.id === 'core.runtime-verifier');
      expect(plugin.enabled).toBe(true);
    });

    it('disables a plugin', () => {
      listPlugins();
      const updated = togglePlugin('core.runtime-verifier', false);
      const plugin = updated.find((p) => p.id === 'core.runtime-verifier');
      expect(plugin.enabled).toBe(false);
    });

    it('creates an audit entry for the toggle', () => {
      listPlugins();
      togglePlugin('core.runtime-verifier', false);
      const audit = listPluginAudit();
      expect(audit.length).toBeGreaterThan(0);
      expect(audit[audit.length - 1].action).toBe('disabled');
    });

    it('creates enabled audit entry when enabling', () => {
      listPlugins();
      togglePlugin('core.runtime-verifier', false);
      togglePlugin('core.runtime-verifier', true);
      const audit = listPluginAudit();
      const last = audit[audit.length - 1];
      expect(last.action).toBe('enabled');
    });
  });

  describe('discoverDiskPluginManifests', () => {
    it('returns manifests on success', async () => {
      invoke.mockResolvedValueOnce([{ id: 'disk-plugin' }]);
      const manifests = await discoverDiskPluginManifests('/workspace');
      expect(manifests).toHaveLength(1);
      expect(invoke).toHaveBeenCalledWith('discover_plugins_from_disk', { workspaceRoot: '/workspace' });
    });

    it('returns empty array on failure', async () => {
      invoke.mockRejectedValueOnce(new Error('IPC error'));
      const manifests = await discoverDiskPluginManifests();
      expect(manifests).toEqual([]);
    });

    it('returns empty array when non-array result', async () => {
      invoke.mockResolvedValueOnce(null);
      const manifests = await discoverDiskPluginManifests();
      expect(manifests).toEqual([]);
    });
  });

  describe('executePluginToolRun', () => {
    it('calls invoke with correct parameters', async () => {
      invoke.mockResolvedValueOnce({ ok: true });
      await executePluginToolRun({ manifestPath: '/m.json', pluginId: 'p1', toolId: 't1', extraArgs: [], workspaceRoot: '/ws' });
      expect(invoke).toHaveBeenCalledWith('execute_plugin_tool', {
        manifestPath: '/m.json',
        pluginId: 'p1',
        toolId: 't1',
        extraArgs: [],
        workspaceRoot: '/ws'
      });
    });
  });

  describe('validatePluginManifestDisk', () => {
    it('calls invoke with manifestPath', async () => {
      invoke.mockResolvedValueOnce({ valid: true });
      await validatePluginManifestDisk('/path/to/manifest.json');
      expect(invoke).toHaveBeenCalledWith('validate_plugin_manifest_disk', { manifestPath: '/path/to/manifest.json' });
    });
  });
});
