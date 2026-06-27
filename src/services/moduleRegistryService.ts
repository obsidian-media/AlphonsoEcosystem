import { durableGet, durableSet, durableRemove } from '../lib/durableStore';

const STORAGE_KEY = 'alphonso_modules_v1';

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: string[];
  models: string[];
  schedules: string[];
  entrypoint: string;
  ui?: string;
  policy?: { tags: string[] };
}

export interface ModuleRecord {
  manifest: ModuleManifest;
  status: 'enabled' | 'disabled' | 'error';
  installedAt: string;
  lastRun?: string;
  errorCount: number;
}

const REQUIRED_FIELDS: (keyof ModuleManifest)[] = [
  'id', 'name', 'version', 'description', 'author',
  'capabilities', 'models', 'schedules', 'entrypoint',
];

function readModules(): ModuleRecord[] {
  try {
    const raw = durableGet(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeModules(records: ModuleRecord[]): void {
  durableSet(STORAGE_KEY, JSON.stringify(records));
}

function parseTOML(toml: string): Partial<ModuleManifest> {
  const result: Record<string, unknown> = {};
  for (const line of toml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawVal = trimmed.slice(eq + 1).trim();
    if (rawVal.startsWith('[')) {
      try {
        result[key] = JSON.parse(rawVal.replace(/'/g, '"'));
      } catch {
        result[key] = [];
      }
    } else {
      result[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  }
  return result as Partial<ModuleManifest>;
}

export async function installModule(path: string): Promise<{ success: boolean; error?: string }> {
  try {
    let tomlText: string;
    const tomlPath = path.endsWith('module.toml') ? path : `${path}/module.toml`;
    try {
      // In Tauri, use invoke('read_file') to read disk paths — fetch() can't access local files
      const { invoke } = await import('@tauri-apps/api/core');
      tomlText = await invoke<string>('read_file', { path: tomlPath });
    } catch {
      // Fallback to fetch for web/dev mode
      try {
        const resp = await fetch(tomlPath);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        tomlText = await resp.text();
      } catch {
        return { success: false, error: `Cannot read module.toml from: ${tomlPath}` };
      }
    }

    const manifest = parseTOML(tomlText) as ModuleManifest;

    for (const field of REQUIRED_FIELDS) {
      if (!manifest[field]) {
        return { success: false, error: `Missing required field: ${field}` };
      }
    }

    const records = readModules();
    const existing = records.findIndex(r => r.manifest.id === manifest.id);
    const record: ModuleRecord = {
      manifest,
      status: 'enabled',
      installedAt: new Date().toISOString(),
      errorCount: 0,
    };

    if (existing >= 0) {
      records[existing] = { ...records[existing], manifest, installedAt: record.installedAt };
    } else {
      records.push(record);
    }

    writeModules(records);
    return { success: true };
  } catch (e) {
    return { success: false, error: String((e as Error).message || e) };
  }
}

export function enableModule(id: string): void {
  const records = readModules().map(r =>
    r.manifest.id === id ? { ...r, status: 'enabled' as const } : r
  );
  writeModules(records);
}

export function disableModule(id: string): void {
  const records = readModules().map(r =>
    r.manifest.id === id ? { ...r, status: 'disabled' as const } : r
  );
  writeModules(records);
}

export function listModules(): ModuleRecord[] {
  return readModules();
}

export function getModule(id: string): ModuleRecord | null {
  return readModules().find(r => r.manifest.id === id) ?? null;
}

export function uninstallModule(id: string): void {
  const records = readModules().filter(r => r.manifest.id !== id);
  writeModules(records);
}

export function recordModuleRun(id: string, error?: string): void {
  const records = readModules().map(r => {
    if (r.manifest.id !== id) return r;
    return {
      ...r,
      lastRun: new Date().toISOString(),
      status: error ? 'error' as const : 'enabled' as const,
      errorCount: error ? r.errorCount + 1 : r.errorCount,
    };
  });
  writeModules(records);
}
