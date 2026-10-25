// Hector reads the parts of a page that match the question (agent phase 1,
// owner 2026-10-25). Until then his write-up got the first ~750 characters of
// each page, mostly menus and cookie banners. No model call: navigation lines
// are dropped, paragraphs are scored by the question's words, and the best are
// kept in page order within the budget.
import { HECTOR_LIMITS } from './researchLimits';

const STOP_WORDS = new Set('a an the and or but of in on at to for from by with about as is are was were be been being it its this that these those there here what which who whom whose why how when where many much more most some any all do does did can could should would will shall may might must i you he she we they me my our your their them not no yes than then so if into over under up down out off very just also only'.split(' '));
const NAV_WORDS = /\b(cookie|cookies|subscribe|newsletter|sign in|log in|login|sign up|share on|skip to|privacy policy|terms of use|all rights reserved|menu|follow us|advertisement)\b/i;

/** The words of a question worth matching (lower case, no small words, no repeats). */
export function questionTerms(text: string): string[] {
  const words = String(text || '').toLowerCase().split(/[^a-z0-9À-ɏ]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

function isNavigation(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 6) return true;
  if (NAV_WORDS.test(line)) return true;
  // "Home | About | Contact" style link lists.
  return (line.match(/[|•·»]/g) || []).length >= 3;
}

export function relevantText(pageText: string, terms: string[], budget: number): string {
  const lines = String(pageText || '').split(/\n+|(?<=[.!?])\s{2,}/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const paragraphs = lines.filter((line) => !isNavigation(line));
  if (!paragraphs.length || budget <= 0) return '';
  // A word's stem (its first five letters) so "colonies" finds "colony".
  const stems = [...new Set(terms.map((term) => term.slice(0, 5)))];
  const scored = paragraphs.map((text, index) => {
    const lower = text.toLowerCase();
    const score = stems.reduce((sum, stem) => sum + (new RegExp(`(^|[^a-z0-9])${stem}`).test(lower) ? 1 : 0), 0);
    return { text, index, score };
  });
  const chosen: typeof scored = [];
  let used = 0;
  for (const p of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (p.score === 0 && chosen.length > 0) break;
    const cost = p.text.length + (chosen.length ? 1 : 0);
    if (used + cost > budget) {
      if (!chosen.length) chosen.push({ ...p, text: p.text.slice(0, budget) });
      continue;
    }
    chosen.push(p);
    used += cost;
  }
  return chosen.sort((a, b) => a.index - b.index).map((p) => p.text).join('\n').slice(0, budget);
}

/** Characters of page text per source in one write-up. */
export function pageBudget(sourceCount: number, large: boolean): number {
  const total = large ? HECTOR_LIMITS.pageBudgetLarge : HECTOR_LIMITS.pageBudgetSmall;
  return sourceCount > 0 ? Math.floor(total / sourceCount) : total;
}
