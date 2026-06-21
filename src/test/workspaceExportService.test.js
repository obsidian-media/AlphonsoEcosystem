import { exportWorkspace, importWorkspace } from '../services/workspaceExportService';

const PREFIX = 'alphonso_';

beforeEach(() => {
  localStorage.clear();
});

describe('exportWorkspace', () => {
  it('exports only alphonso_ prefixed keys', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ model: 'llama3' }));
    localStorage.setItem('other_key', 'should_not_appear');
    const json = exportWorkspace();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('alphonso_settings');
    expect(parsed).not.toHaveProperty('other_key');
  });

  it('returns valid JSON string', () => {
    localStorage.setItem('alphonso_test', '{"foo":1}');
    expect(() => JSON.parse(exportWorkspace())).not.toThrow();
  });

  it('returns empty object when no alphonso_ keys exist', () => {
    const parsed = JSON.parse(exportWorkspace());
    expect(Object.keys(parsed).length).toBe(0);
  });

  it('includes multiple alphonso_ keys', () => {
    localStorage.setItem('alphonso_a', '"val_a"');
    localStorage.setItem('alphonso_b', '"val_b"');
    const parsed = JSON.parse(exportWorkspace());
    expect(parsed).toHaveProperty('alphonso_a');
    expect(parsed).toHaveProperty('alphonso_b');
  });
});

describe('importWorkspace', () => {
  it('imports alphonso_ keys into localStorage', () => {
    const json = JSON.stringify({ alphonso_settings: { model: 'llama3' } });
    const result = importWorkspace(json);
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(localStorage.getItem('alphonso_settings')).toBe(JSON.stringify({ model: 'llama3' }));
  });

  it('skips non-alphonso_ keys and records error', () => {
    const json = JSON.stringify({ other_key: 'value', alphonso_ok: 'yes' });
    const result = importWorkspace(json);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.includes('other_key'))).toBe(true);
  });

  it('returns error for invalid JSON', () => {
    const result = importWorkspace('not-json');
    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.includes('Invalid JSON'))).toBe(true);
  });

  it('stores string values as-is', () => {
    const json = JSON.stringify({ alphonso_raw: 'plain-string' });
    importWorkspace(json);
    expect(localStorage.getItem('alphonso_raw')).toBe('plain-string');
  });

  it('round-trips an export', () => {
    localStorage.setItem('alphonso_memory', JSON.stringify([{ id: 1 }]));
    const exported = exportWorkspace();
    localStorage.clear();
    const result = importWorkspace(exported);
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(JSON.parse(localStorage.getItem('alphonso_memory'))).toEqual([{ id: 1 }]);
  });
});
