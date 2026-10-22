// Turns a model's JSON value into text a person can read (QA 2026-10-22).
// Miya Studio printed nested values with JSON.stringify, so a package showed
// `{ "text": "Small changes…" }` and `[ { "scene_id": 1, … } ]` instead of the
// hook and the scenes.

const MAIN_TEXT_KEYS = ['text', 'content', 'description', 'prompt', 'caption', 'title', 'line', 'narration', 'value'];

function humanKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPlain(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function toReadableText(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (depth > 4) return JSON.stringify(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => toReadableText(item, depth + 1))
      .filter(Boolean)
      .map((text) => `• ${text.replace(/\n/g, '\n  ')}`)
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== '');
    // An object that is really one piece of text plus ids/numbers: show the text.
    const main = MAIN_TEXT_KEYS.find((k) => typeof (value as Record<string, unknown>)[k] === 'string');
    const others = entries.filter(([k]) => k !== main && !/^(id|.*_id|.*Id|index|order|number)$/.test(k));
    if (main && others.length === 0) return String((value as Record<string, unknown>)[main]);
    const lines: string[] = [];
    if (main) lines.push(String((value as Record<string, unknown>)[main]));
    for (const [k, v] of main ? others : entries) {
      const text = toReadableText(v, depth + 1);
      if (!text) continue;
      lines.push(isPlain(v) ? `${humanKey(k)}: ${text}` : `${humanKey(k)}:\n  ${text.replace(/\n/g, '\n  ')}`);
    }
    return lines.join('\n');
  }

  return String(value);
}
