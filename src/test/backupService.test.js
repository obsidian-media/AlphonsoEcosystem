import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBackup,
  restoreBackup,
  getBackupSizeEstimate,
  importBackupFromFile
} from '../services/backupService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => mockInvoke(...args) }));

vi.mock('../services/trustModel', () => ({
  timestampMs: vi.fn(() => 1700000000000)
}));

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore = {};
const mockLocalStorage = {
  getItem: vi.fn((k) => localStorageStore[k] ?? null),
  setItem: vi.fn((k, v) => { localStorageStore[k] = String(v); }),
  removeItem: vi.fn((k) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); }),
  get length() { return Object.keys(localStorageStore).length; },
  key: vi.fn((i) => Object.keys(localStorageStore)[i] ?? null)
};
vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

// ── createBackup ──────────────────────────────────────────────────────────────

describe('createBackup', () => {
  it('returns a backup object with version, createdAtMs, localStorage, sqlite', async () => {
    mockInvoke
      .mockResolvedValueOnce([]) // list_memory_records
      .mockResolvedValueOnce([]); // kv_list_keys

    const backup = await createBackup();
    expect(backup).toHaveProperty('version', 'v1');
    expect(backup).toHaveProperty('createdAtMs', 1700000000000);
    expect(backup).toHaveProperty('localStorage');
    expect(backup).toHaveProperty('sqlite');
  });

  it('includes localStorage data for known backup keys', async () => {
    localStorageStore['alphonso_settings_v1'] = JSON.stringify({ model: 'llama3' });
    mockInvoke
      .mockResolvedValueOnce([]) // list_memory_records
      .mockResolvedValueOnce([]); // kv_list_keys

    const backup = await createBackup();
    expect(backup.localStorage).toHaveProperty('alphonso_settings_v1');
    expect(backup.localStorage['alphonso_settings_v1']).toEqual({ model: 'llama3' });
  });

  it('includes sqlite memory records', async () => {
    const records = [{ id: 'mem-1', title: 'Test memory', content: {} }];
    mockInvoke
      .mockResolvedValueOnce(records) // list_memory_records
      .mockResolvedValueOnce([]); // kv_list_keys

    const backup = await createBackup();
    expect(backup.sqlite.memoryRecords).toEqual(records);
  });

  it('handles SQLite errors gracefully with error field', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('SQLite not available'));
    // kv_list_keys will also fail
    mockInvoke.mockRejectedValueOnce(new Error('KV not available'));

    const backup = await createBackup();
    expect(backup.sqlite.error).toMatch(/not available/i);
  });

  // QA 2026-10-21: the backup used a fixed list of 19 keys, one of which
  // ('alphonso_settings_v1') the app never writes, so app settings, Boardroom
  // threads, Coach settings and the rest were left out.
  it('includes every app key, including the real settings key', async () => {
    localStorageStore['alphonso_settings'] = JSON.stringify({ selectedModel: 'llama3.2:3b' });
    localStorageStore['alphonso_boardroom_threads_v2'] = JSON.stringify([{ id: 't1' }]);
    localStorageStore['alphonso_coach_enabled_v1'] = 'false';
    mockInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const backup = await createBackup();
    expect(backup.localStorage.alphonso_settings).toEqual({ selectedModel: 'llama3.2:3b' });
    expect(backup.localStorage.alphonso_boardroom_threads_v2).toEqual([{ id: 't1' }]);
    expect(backup.localStorage.alphonso_coach_enabled_v1).toBe(false);
  });

  it('leaves secrets out of the backup file', async () => {
    localStorageStore['alphonso_plugin_signer_keypair_v1'] = JSON.stringify({ privateKey: 'PRIVATE' });
    localStorageStore['alphonso_connector_credentials_v1'] = JSON.stringify({ slack: { SLACK_BOT_TOKEN: 'xoxb' } });
    localStorageStore['alphonso_license_token'] = 'signed.token';
    localStorageStore['alphonso_connector_auth_profiles_v1'] = JSON.stringify({ slack: { enabled: true, apiKey: 'leak' } });
    mockInvoke.mockImplementation(async (cmd, args) => {
      if (cmd === 'list_memory_records') return [];
      if (cmd === 'kv_list_keys') return ['alphonso_connector_credentials_v1', 'alphonso_chats_v1'];
      if (cmd === 'kv_get') return args.key === 'alphonso_chats_v1' ? '[{"id":"c1"}]' : '{"secret":"x"}';
      return null;
    });
    const backup = await createBackup();
    const file = JSON.stringify(backup);
    expect(file).not.toMatch(/PRIVATE|xoxb|signed\.token|leak/);
    expect(backup.localStorage.alphonso_connector_auth_profiles_v1).toEqual({ slack: { enabled: true } });
    expect(backup.sqlite.kvStore).toEqual({ alphonso_chats_v1: '[{"id":"c1"}]' });
    expect(mockInvoke).toHaveBeenCalledWith('kv_list_keys', { prefix: 'alphonso_' });
  });

  it('does not include non-backup keys from localStorage', async () => {
    localStorageStore['some_other_key'] = 'should-not-appear';
    mockInvoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const backup = await createBackup();
    expect(backup.localStorage).not.toHaveProperty('some_other_key');
  });
});

// ── restoreBackup ─────────────────────────────────────────────────────────────

describe('restoreBackup', () => {
  it('throws on invalid backup format (missing version)', async () => {
    await expect(restoreBackup({ data: {} })).rejects.toThrow();
  });

  it('throws on version mismatch', async () => {
    await expect(restoreBackup({ version: 'v0', localStorage: {} })).rejects.toThrow(/version/i);
  });

  it('restores localStorage keys and returns count', async () => {
    const backup = {
      version: 'v1',
      localStorage: {
        'alphonso_settings_v1': { model: 'llama3' },
        'alphonso_chats_v1': []
      },
      sqlite: null
    };
    mockInvoke.mockResolvedValue(undefined);

    const result = await restoreBackup(backup);
    expect(result.localStorageRestored).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'alphonso_settings_v1',
      JSON.stringify({ model: 'llama3' })
    );
  });

  it('never writes a secret key back, even if a backup file contains one', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await restoreBackup({
      version: 'v1',
      createdAtMs: 1,
      localStorage: { alphonso_plugin_signer_keypair_v1: { privateKey: 'X' }, alphonso_settings: { a: 1 } },
      sqlite: { memoryRecords: [], kvStore: { alphonso_connector_credentials_v1: '{}' } }
    });
    expect(localStorageStore.alphonso_plugin_signer_keypair_v1).toBeUndefined();
    expect(localStorageStore.alphonso_settings).toBe('{"a":1}');
    expect(mockInvoke).not.toHaveBeenCalledWith('kv_set', expect.objectContaining({ key: 'alphonso_connector_credentials_v1' }));
    expect(result.errors.join(' ')).toMatch(/skipped \(secret\)/);
  });

  it('restores sqlite memory records', async () => {
    const backup = {
      version: 'v1',
      localStorage: {},
      sqlite: {
        memoryRecords: [{ id: 'r1', title: 'Test' }]
      }
    };
    mockInvoke.mockResolvedValueOnce({ written: 1 }); // upsert_memory_records

    const result = await restoreBackup(backup);
    expect(result.sqliteRestored).toBeGreaterThan(0);
    expect(mockInvoke).toHaveBeenCalledWith('upsert_memory_records', {
      records: backup.sqlite.memoryRecords
    });
  });

  it('records errors for failed localStorage writes', async () => {
    mockLocalStorage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded'); });

    const backup = {
      version: 'v1',
      localStorage: { 'alphonso_settings_v1': { model: 'llama3' } },
      sqlite: null
    };

    const result = await restoreBackup(backup);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('alphonso_settings_v1');
  });

  it('handles null sqlite gracefully', async () => {
    const backup = {
      version: 'v1',
      localStorage: {},
      sqlite: null
    };
    const result = await restoreBackup(backup);
    expect(result.errors.length).toBe(0);
    expect(result.sqliteRestored).toBe(0);
  });
});

// ── getBackupSizeEstimate ─────────────────────────────────────────────────────

describe('getBackupSizeEstimate', () => {
  it('returns bytes, kb, mb fields', () => {
    const estimate = getBackupSizeEstimate();
    expect(estimate).toHaveProperty('bytes');
    expect(estimate).toHaveProperty('kb');
    expect(estimate).toHaveProperty('mb');
  });

  it('returns zero bytes when localStorage is empty', () => {
    const estimate = getBackupSizeEstimate();
    expect(estimate.bytes).toBe(0);
    expect(estimate.kb).toBe(0);
  });

  it('returns non-zero bytes when backup keys have data', () => {
    localStorageStore['alphonso_settings_v1'] = JSON.stringify({ model: 'llama3', key: 'value' });
    const estimate = getBackupSizeEstimate();
    expect(estimate.bytes).toBeGreaterThan(0);
    expect(estimate.kb).toBeGreaterThanOrEqual(0);
  });

  it('returns mb as a string with decimal', () => {
    const estimate = getBackupSizeEstimate();
    expect(typeof estimate.mb).toBe('string');
    expect(estimate.mb).toMatch(/\d+\.\d{2}/);
  });
});

// ── importBackupFromFile ──────────────────────────────────────────────────────

describe('importBackupFromFile', () => {
  it('resolves with parsed JSON from a valid backup file', async () => {
    const backupData = { version: 'v1', localStorage: {}, sqlite: null };
    const fileContent = JSON.stringify(backupData);

    const mockFile = {
      name: 'backup.json'
    };

    // Mock FileReader
    const mockFileReader = {
      onload: null,
      onerror: null,
      readAsText: vi.fn(function () {
        setTimeout(() => {
          this.onload({ target: { result: fileContent } });
        }, 0);
      })
    };
    vi.stubGlobal('FileReader', vi.fn(function () { return mockFileReader; }));

    const result = await importBackupFromFile(mockFile);
    expect(result).toEqual(backupData);
  });

  it('rejects with parse error for invalid JSON file', async () => {
    const mockFile = { name: 'bad.json' };
    const mockFileReader = {
      onload: null,
      onerror: null,
      readAsText: vi.fn(function () {
        setTimeout(() => {
          this.onload({ target: { result: 'not-valid-json{{' } });
        }, 0);
      })
    };
    vi.stubGlobal('FileReader', vi.fn(function () { return mockFileReader; }));

    await expect(importBackupFromFile(mockFile)).rejects.toThrow(/Invalid backup file/i);
  });

  it('rejects when FileReader fires an error', async () => {
    const mockFile = { name: 'unreadable.json' };
    const mockFileReader = {
      onload: null,
      onerror: null,
      readAsText: vi.fn(function () {
        setTimeout(() => {
          this.onerror();
        }, 0);
      })
    };
    vi.stubGlobal('FileReader', vi.fn(function () { return mockFileReader; }));

    await expect(importBackupFromFile(mockFile)).rejects.toThrow(/Failed to read/i);
  });
});
