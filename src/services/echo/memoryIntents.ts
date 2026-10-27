// Requests that are Echo's work (agent phase 7): remember, forget, tidy memory, and "what did we decide".
// Used by Jose's router and planner, his route decision, and Echo's own save step.

/** A request to remember something (agent phase 7). */
export function asksToRemember(text: string): boolean {
  // "Remember that …", "Please remember …", or a message that starts with "Remember"; not "Do you remember …?".
  const t = String(text || '');
  return /^\s*(?:\/jose\s+)?(?:please\s+)?remember\b|\b(?:remember that|please remember|don'?t forget that|keep in mind that)\b/i.test(t) && !asksToForget(t);
}

/** A request to forget a saved decision (agent phase 7). */
export function asksToForget(text: string): boolean {
  return /\b(forget|stop remembering)\b/i.test(String(text || '')) && !/\bdon'?t forget\b/i.test(String(text || ''));
}

/** A request to tidy memory (agent phase 7). */
export function asksToCleanUpMemory(text: string): boolean {
  return /\b(clean(?:\s|-)?up|tidy(?:\s+up)?)\s+(?:my\s+|the\s+)?memory\b|\bmerge (?:my\s+)?notes\b/i.test(String(text || ''));
}

/** A question about what was decided before (agent phase 7). */
export function asksWhatWasDecided(text: string): boolean {
  return /\bwhat (?:did (?:we|i) (?:decide|say|agree)|was decided|have we decided)\b|\bremind me what\b|\bdo you remember what\b/i.test(String(text || ''));
}
