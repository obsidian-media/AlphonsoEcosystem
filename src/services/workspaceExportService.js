const PREFIX = 'alphonso_';

export function exportWorkspace() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      try { data[key] = JSON.parse(localStorage.getItem(key)); } catch { data[key] = localStorage.getItem(key); }
    }
  }
  return JSON.stringify(data, null, 2);
}

export function importWorkspace(jsonString) {
  const errors = [];
  let imported = 0;
  try {
    const data = JSON.parse(jsonString);
    Object.entries(data).forEach(([key, value]) => {
      if (!key.startsWith(PREFIX)) { errors.push(`Skipped non-alphonso key: ${key}`); return; }
      try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        imported++;
      } catch (e) { errors.push(`Failed to import ${key}: ${e.message}`); }
    });
  } catch (e) {
    errors.push(`Invalid JSON: ${e.message}`);
  }
  return { imported, errors };
}
