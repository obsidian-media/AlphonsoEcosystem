// Plans the user saved as templates (design §2.4; phase 3). They are scored
// and offered exactly like the built-in ones.
import type { JoseTemplate } from './joseTemplates';
import type { PlanStep } from './stepGraph';

const KEY = 'alphonso_jose_user_templates_v1';
const STOP_WORDS = new Set(['this', 'that', 'with', 'from', 'into', 'about', 'please', 'could', 'would', 'should', 'there', 'their', 'what', 'when', 'which', 'your', 'have', 'make', 'some', 'them', 'they', 'then', 'than', 'also', 'just', 'like', 'want', 'need']);

function readAll(): JoseTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(templates: JoseTemplate[]): void {
  localStorage.setItem(KEY, JSON.stringify(templates));
}

function words(text: string, minLength: number): string[] {
  return [...new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= minLength && !STOP_WORDS.has(w)))];
}

function slug(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
}

export function listUserTemplates(): JoseTemplate[] {
  return readAll();
}

export function saveUserTemplate(input: { name: string; kind: 'normal' | 'project'; steps: PlanStep[]; requestText: string }): JoseTemplate {
  const all = readAll();
  const base = `user_${slug(input.name)}`;
  let id = base;
  for (let n = 2; all.some((t) => t.id === id); n += 1) id = `${base}-${n}`;
  const nameWords = words(input.name, 3);
  const requestWords = words(input.requestText, 4).slice(0, 8);
  const template: JoseTemplate = {
    id,
    name: input.name.trim() || 'My plan',
    kind: input.kind,
    matchWords: [nameWords, requestWords].filter((group) => group.length > 0),
    steps: input.steps.map((s) => ({ ...s, needs: [...s.needs], effects: [...s.effects] })),
  };
  writeAll([...all, template]);
  return template;
}

export function deleteUserTemplate(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}
