interface ImportResult {
  imported: number;
  errors: string[];
}

const PREFIX = 'alphonso_';

export function exportWorkspace(): string {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      try { data[key] = JSON.parse(localStorage.getItem(key) as string); } catch { data[key] = localStorage.getItem(key); }
    }
  }
  return JSON.stringify(data, null, 2);
}

export function importWorkspace(jsonString: string): ImportResult {
  const errors: string[] = [];
  let imported = 0;
  try {
    const data = JSON.parse(jsonString) as Record<string, unknown>;
    Object.entries(data).forEach(([key, value]) => {
      if (!key.startsWith(PREFIX)) { errors.push(`Skipped non-alphonso key: ${key}`); return; }
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        imported++;
      } catch (e: unknown) { errors.push(`Failed to import ${key}: ${(e as Error).message}`); }
    });
  } catch (e) {
    errors.push(`Invalid JSON: ${(e as Error).message}`);
  }
  return { imported, errors };
}