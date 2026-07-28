#!/usr/bin/env node
/**
 * Alphonso — Agent / Skill-Pack / Permission Matrix Generator
 *
 * Truth-First Execution Plan, task C3: "Generate human-readable agent/pack/
 * permission documentation from the registry so code and docs cannot drift."
 *
 * Statically parses the real source-of-truth files (not a hand-typed copy)
 * and writes docs/AGENT_SKILL_PERMISSION_MATRIX.md:
 *   - src/services/skillPackContent*.ts   (BASE_PACKS — id/name/permissions/ownerAgent)
 *   - src/services/skillPackWorkflowData.ts (AGENT_WORKFLOW_SKILL_DEFS)
 *   - src/services/agentContractService.ts (AGENT_EXECUTION_CONTRACTS,
 *     AGENT_SKILL_PACK_SCOPE_OVERRIDES)
 *
 * Uses regex extraction rather than importing the modules directly because
 * agentContractService.ts has type annotations plain Node ESM can't parse
 * without a build step. The corresponding CI-enforced correctness check
 * (real imports, real validation) lives in
 * src/test/services/skillPackContractMatrix.test.ts and runs under `npm test`.
 *
 * Usage:
 *   node scripts/generate-skill-permission-matrix.mjs          # write the doc
 *   node scripts/generate-skill-permission-matrix.mjs --check  # exit 1 if stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), '..');
const SKILL_PACK_CONTENT_PATHS = [
  ['src/services/skillPackContentCore.ts', 'CORE_BASE_PACKS'],
  ['src/services/skillPackContentJose.ts', 'JOSE_BASE_PACKS'],
  ['src/services/skillPackContentMaria.ts', 'MARIA_BASE_PACKS'],
  ['src/services/skillPackContentMarcus.ts', 'MARCUS_BASE_PACKS'],
  ['src/services/skillPackContentEcho.ts', 'ECHO_BASE_PACKS'],
  ['src/services/skillPackContentSentinel.ts', 'SENTINEL_BASE_PACKS'],
  ['src/services/skillPackContentNova.ts', 'NOVA_BASE_PACKS']
].map(([relativePath, exportName]) => ({
  path: join(PROJECT_ROOT, relativePath),
  exportName
}));
const WORKFLOW_PACKS_PATH = join(PROJECT_ROOT, 'src/services/skillPackWorkflowData.ts');
const AGENT_CONTRACT_SERVICE_PATH = join(PROJECT_ROOT, 'src/services/agentContractService.ts');
const OUTPUT_PATH = join(PROJECT_ROOT, 'docs/AGENT_SKILL_PERMISSION_MATRIX.md');

function parseStringArray(raw) {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^['"]/, '').replace(/['"]$/, ''));
}

function extractPacks(source, exportName) {
  // Matches each `{ id: 'pack.x', ... permissions: [...], ... ownerAgent: 'y', ... }`
  // block in the selected array-literal order.
  //
  // Uses [^{}]* (not [\s\S]*) between fields so each lazy scan is bounded to
  // the current object's own braces and can never cross into a sibling pack.
  // The previous [\s\S]*? version could and did: any pack with no ownerAgent
  // field (e.g. pack.developer-core) let the optional ownerAgent group's
  // unbounded lazy scan reach forward into a LATER sibling that does have one,
  // silently dropping the pack in between from the generated doc entirely.
  // Caught by the pack-count cross-check in buildMatrix() below, which found
  // pack.developer-core and pack.codex-professional-coding missing.
  const packRe = new RegExp(
    String.raw`\{\s*id:\s*['"]([^'"]+)['"][^{}]*?name:\s*['"]([^'"]+)['"][^{}]*?permissions:\s*\[([^\]]*)\][^{}]*?category:\s*['"]([^'"]+)['"](?:[^{}]*?ownerAgent:\s*['"]([^'"]+)['"])?[^{}]*?\n\s{2}\}`,
    'g'
  );
  const block = source.match(new RegExp(`export const ${exportName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!block) {
    throw new Error(
      `generate-skill-permission-matrix: ${exportName} block regex found no match in source — ` +
      'source shape likely changed. Fix the regex rather than silently publishing zero packs.'
    );
  }
  const packs = [];
  let m;
  while ((m = packRe.exec(block[1]))) {
    packs.push({
      id: m[1],
      name: m[2],
      permissions: parseStringArray(m[3]),
      category: m[4],
      ownerAgent: m[5] || null
    });
  }
  return packs;
}

function extractContractAgents(source) {
  const block = source.match(/AGENT_EXECUTION_CONTRACTS[^{]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error(
      'generate-skill-permission-matrix: AGENT_EXECUTION_CONTRACTS block regex ' +
      'found no match in agentContractService.ts — source shape likely changed. ' +
      'Fix the regex rather than silently publishing an empty agent list.'
    );
  }
  const agentRe = /\[AGENTS\.(\w+)\]:\s*\{\s*role:\s*['"]([^'"]+)['"]/g;
  const agents = [];
  let m;
  while ((m = agentRe.exec(block[1]))) {
    agents.push({ key: m[1], role: m[2] });
  }
  return agents;
}

function extractOverrideIds(source) {
  const block = source.match(/const AGENT_SKILL_PACK_SCOPE_OVERRIDES[^{]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    throw new Error(
      'generate-skill-permission-matrix: AGENT_SKILL_PACK_SCOPE_OVERRIDES block ' +
      'regex found no match in agentContractService.ts — source shape likely ' +
      'changed. Fix the regex rather than silently publishing zero overrides.'
    );
  }
  const idRe = /'(pack\.[^']+)':/g;
  const ids = new Set();
  let m;
  while ((m = idRe.exec(block[1]))) ids.add(m[1]);
  return ids;
}

function extractWorkflowPacks(source) {
  // AGENT_WORKFLOW_SKILL_DEFS entries — shared/cross-agent packs. These have
  // no ownerAgent and no category field of their own (AGENT_WORKFLOW_PACKS
  // adds category: 'agent_workflow' via a .map() that references skill.id/
  // skill.name rather than string literals, so extractPacks' literal-string
  // regex can't and shouldn't match them — they're captured here instead,
  // directly from their own literal source shape).
  const block = source.match(/export const AGENT_WORKFLOW_SKILL_DEFS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) return [];
  const packRe = /\{\s*id:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"],\s*description:\s*['"]([^'"]*)['"],\s*permissions:\s*\[([^\]]*)\]\s*\}/g;
  const packs = [];
  let m;
  while ((m = packRe.exec(block[1]))) {
    packs.push({ id: m[1], name: m[2], description: m[3], permissions: parseStringArray(m[4]) });
  }
  if (packs.length === 0) {
    throw new Error(
      'generate-skill-permission-matrix: AGENT_WORKFLOW_SKILL_DEFS block was ' +
      'found but its per-entry regex matched zero packs — source shape likely ' +
      'changed. Fix the regex rather than silently publishing zero workflow packs.'
    );
  }
  return packs;
}

function extractBlockedOverrides(source) {
  // Note: unlike the two regexes above, this one must also match the current
  // legitimately-empty single-line form (`= {};`, no newline before the
  // closing brace) — AGENT_SKILL_PACK_BLOCKED_OVERRIDES has no entries in
  // production today (Truth-First C2/C3). An empty result here is valid; the
  // throw below is only for the block itself going missing entirely.
  const block = source.match(/AGENT_SKILL_PACK_BLOCKED_OVERRIDES[^{]*=\s*\{([\s\S]*?)\};/);
  if (!block) {
    throw new Error(
      'generate-skill-permission-matrix: AGENT_SKILL_PACK_BLOCKED_OVERRIDES ' +
      'block regex found no match in agentContractService.ts — source shape ' +
      'likely changed. Fix the regex rather than silently publishing zero ' +
      'blocked overrides.'
    );
  }
  const entryRe = /'(pack\.[^']+)':\s*\[([^\]]*)\]/g;
  const map = new Map();
  let m;
  while ((m = entryRe.exec(block[1]))) {
    map.set(m[1], parseStringArray(m[2]));
  }
  return map;
}

function buildMatrix() {
  const packSources = SKILL_PACK_CONTENT_PATHS.map(({ path, exportName }) => ({
    source: readFileSync(path, 'utf8'),
    exportName,
    path
  }));
  const workflowSource = readFileSync(WORKFLOW_PACKS_PATH, 'utf8');
  const contractSource = readFileSync(AGENT_CONTRACT_SERVICE_PATH, 'utf8');

  const allExtractedPacks = packSources.flatMap(({ source, exportName }) => extractPacks(source, exportName));
  const packs = allExtractedPacks.filter((p) => p.category === 'agent_skill');
  const workflowPacks = extractWorkflowPacks(workflowSource);
  const agents = extractContractAgents(contractSource);
  const overrideIds = extractOverrideIds(contractSource);
  const blockedOverrides = extractBlockedOverrides(contractSource);

  // Cross-check: every `id: 'pack.x'` occurrence in the source must be
  // accounted for by either extractPacks (BASE_PACKS, any category) or
  // extractWorkflowPacks (AGENT_WORKFLOW_SKILL_DEFS) — if the count doesn't
  // match, one of those regexes silently missed real packs rather than the
  // source genuinely having fewer packs, and a doc silently missing packs is
  // worse than a loud failure.
  const totalPackIdOccurrences = [
    ...packSources.map(({ source }) => source),
    workflowSource
  ]
    .map((source) => source.match(/id:\s*['"]pack\.[^'"]+['"]/g) || [])
    .flat().length;
  const accountedFor = allExtractedPacks.length + workflowPacks.length;
  if (accountedFor !== totalPackIdOccurrences) {
    throw new Error(
      `generate-skill-permission-matrix: found ${totalPackIdOccurrences} ` +
      `'id: pack.*' occurrences in the skill-pack source modules but only accounted ` +
      `for ${accountedFor} via extractPacks + extractWorkflowPacks — one of ` +
      'those regexes is silently missing real packs. Fix the regex rather ' +
      'than publishing an incomplete matrix.'
    );
  }

  const agentNames = new Set(agents.map((a) => a.key.toLowerCase()));
  const byOwner = new Map();
  for (const pack of packs) {
    const owner = pack.ownerAgent || '(unowned)';
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(pack);
  }

  const lines = [];
  lines.push('# Agent Skill-Pack Permission Matrix');
  lines.push('');
  lines.push('**Generated file — do not hand-edit.**');
  lines.push('');
  lines.push('Regenerate with `node scripts/generate-skill-permission-matrix.mjs` after');
  lines.push('changing `src/services/skillPackContent*.ts`,');
  lines.push('`src/services/skillPackWorkflowData.ts`, or');
  lines.push('`src/services/agentContractService.ts`. Correctness (every pack owned,');
  lines.push('documented, and within its own contract) is enforced independently by');
  lines.push('`src/test/services/skillPackContractMatrix.test.ts`, which runs under');
  lines.push('`npm test` and therefore gates CI — this doc is the human-readable view of');
  lines.push('the same source of truth, not a separate claim.');
  lines.push('');
  lines.push('Source of truth: `src/services/skillPackContent*.ts` (packs) +');
  lines.push('`src/services/skillPackWorkflowData.ts` (workflow packs) +');
  lines.push('`src/services/agentContractService.ts` (contracts + per-pack scope overrides).');
  lines.push('');
  lines.push('**Shared status.** A pack is either exclusive (owned by exactly one agent,');
  lines.push('scoped by that agent\'s contract) or shared (usable by any agent, category');
  lines.push('`agent_workflow`, no `ownerAgent`, unscoped by');
  lines.push('`validateSkillPackAgainstContract` by design). See the two sections below.');
  lines.push('');
  lines.push('**Blocked prefixes.** Every pack (except Alphonso\'s) is always subject to');
  lines.push('the universal blocklist (`filesystem.write`, `execute_command`,');
  lines.push('`external_publish`, `purchase`) regardless of its allowlist. A pack can');
  lines.push('additionally carry its own narrower denylist in');
  lines.push('`AGENT_SKILL_PACK_BLOCKED_OVERRIDES`, applied even to Alphonso, shown per');
  lines.push('pack below when present.');
  lines.push('');
  lines.push(`Total exclusive \`agent_skill\` category packs: **${packs.length}**`);
  lines.push(`Total shared \`agent_workflow\` category packs: **${workflowPacks.length}**`);
  lines.push('');
  lines.push('## Exclusive packs (owned by one agent)');
  lines.push('');

  for (const [owner, ownerPacks] of [...byOwner.entries()].sort()) {
    const agentRecord = agents.find((a) => a.key.toLowerCase() === owner);
    const roleLabel = agentRecord ? agentRecord.role : owner === '(unowned)' ? 'n/a' : '**UNKNOWN AGENT**';
    const ownerKnown = owner === '(unowned)' || agentNames.has(owner);
    lines.push(`### ${owner}${ownerKnown ? '' : ' ⚠️ owner not found in AGENT_EXECUTION_CONTRACTS'}`);
    lines.push('');
    lines.push(`Role: \`${roleLabel}\``);
    lines.push('');
    lines.push('| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |');
    lines.push('|---|---|---|---|---|');
    for (const pack of ownerPacks.sort((a, b) => a.id.localeCompare(b.id))) {
      const scope = overrideIds.has(pack.id) ? 'per-pack override' : 'agent-wide default';
      const permsCell = pack.permissions.length ? pack.permissions.map((p) => `\`${p}\``).join(', ') : '⚠️ none declared';
      const blocked = blockedOverrides.get(pack.id);
      const blockedCell = blocked && blocked.length ? blocked.map((p) => `\`${p}\``).join(', ') : '—';
      lines.push(`| \`${pack.id}\` | ${pack.name} | ${scope} | ${permsCell} | ${blockedCell} |`);
    }
    lines.push('');
  }

  lines.push('## Shared packs (cross-agent, unscoped by contract)');
  lines.push('');
  lines.push('| Pack ID | Name | Permissions |');
  lines.push('|---|---|---|');
  for (const pack of workflowPacks.sort((a, b) => a.id.localeCompare(b.id))) {
    const permsCell = pack.permissions.length ? pack.permissions.map((p) => `\`${p}\``).join(', ') : '⚠️ none declared';
    lines.push(`| \`${pack.id}\` | ${pack.name} | ${permsCell} |`);
  }
  lines.push('');

  return lines.join('\n') + '\n';
}

const content = buildMatrix();
const checkMode = process.argv.includes('--check');

if (checkMode) {
  let existing = '';
  try {
    existing = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    console.error(`Missing ${OUTPUT_PATH} — run without --check to generate it.`);
    process.exit(1);
  }
  if (existing !== content) {
    console.error('docs/AGENT_SKILL_PERMISSION_MATRIX.md is stale relative to source. Run: node scripts/generate-skill-permission-matrix.mjs');
    process.exit(1);
  }
  console.log('docs/AGENT_SKILL_PERMISSION_MATRIX.md is up to date.');
} else {
  writeFileSync(OUTPUT_PATH, content, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

