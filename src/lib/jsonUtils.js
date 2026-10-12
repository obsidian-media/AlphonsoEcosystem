export function parseJsonResponse(text) {
  const trimmed = String(text || '').trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1] : trimmed;
  return JSON.parse(raw);
}

/**
 * Best-effort read of a JSON object out of a model reply. Models often wrap
 * JSON in ``` fences or put a sentence before/after it; strict JSON.parse on
 * the whole reply then fails even though a usable object is right there.
 * Returns the object, or null when the reply holds no JSON object at all.
 */
export function extractJsonObject(text) {
  const candidates = [];
  try {
    candidates.push(parseJsonResponse(text));
  } catch {
    // Not plain or fenced JSON; try the outermost braces below.
  }
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      candidates.push(JSON.parse(raw.slice(start, end + 1)));
    } catch {
      // No parseable object between the braces either.
    }
  }
  return candidates.find((value) => value && typeof value === 'object' && !Array.isArray(value)) ?? null;
}
