import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPolicyRules } from '../services/policyDslService';

/**
 * `policy.yaml` is the human-editable copy of the module policy DSL, but the
 * runtime never reads it: `policyDslService.ts` embeds the same rules. This
 * test fails the moment the two drift, so an edit to one file can't silently
 * have no effect (DEFERRED_WORK 2026-09-20/21, closed 2026-09-30).
 *
 * The parser below handles only the small YAML subset policy.yaml uses:
 * a `rules:` list of `- id:` items with `description`, a `match:` map of
 * quoted strings, and `effect`.
 */
function parsePolicyYaml(text) {
  const rules = [];
  let current = null;
  let inMatch = false;
  const unquote = (value) => value.trim().replace(/^"(.*)"$/, '$1');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const idMatch = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (idMatch) {
      current = { id: unquote(idMatch[1]), match: {}, effect: '' };
      rules.push(current);
      inMatch = false;
      continue;
    }
    if (!current) continue;
    if (/^\s{4}match:\s*$/.test(line)) {
      inMatch = true;
      continue;
    }
    const matchEntry = line.match(/^\s{6}(\w+):\s*(.+)$/);
    if (inMatch && matchEntry) {
      current.match[matchEntry[1]] = unquote(matchEntry[2]);
      continue;
    }
    const effect = line.match(/^\s{4}effect:\s*(.+)$/);
    if (effect) {
      current.effect = unquote(effect[1]);
      inMatch = false;
      continue;
    }
    if (/^\s{4}\w+:/.test(line)) inMatch = false;
  }
  return rules;
}

describe('policy.yaml <-> policyDslService sync', () => {
  it('embedded rules match policy.yaml exactly (ids, order, match, effect)', () => {
    const yamlRules = parsePolicyYaml(readFileSync(resolve(__dirname, '../../policy.yaml'), 'utf8'));
    const embedded = getPolicyRules().map((rule) => ({ id: rule.id, match: rule.match, effect: rule.effect }));
    expect(yamlRules.length).toBeGreaterThan(0);
    expect(embedded).toEqual(yamlRules);
  });
});
