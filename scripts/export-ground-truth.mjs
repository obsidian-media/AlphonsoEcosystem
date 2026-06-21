#!/usr/bin/env node
/**
 * Alphonso — Ground Truth Auto-Export
 *
 * Single source of truth for repo counters, runtime status, and drift.
 * Writes:
 *   - ALPHONSO_GROUND_TRUTH.generated.md     (operator-readable)
 *   - alphonso-ground-truth.snapshot.json    (machine-readable)
 *
 * Reuses shared counting utilities from scripts/shared/counters.mjs.
 *
 * Drift detection compares a small set of numeric claims baked into the script
 * (the same ones OpenCode audits by hand). If a claim is wrong, the script
 * prints a `[drift]` line and writes the diff into the generated artifacts.
 *
 * Flags:
 *   --fail-on-drift    Exit non-zero if any drift detected (for CI)
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countLines, getAllCounts } from './shared/counters.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const OUTPUT_MD = join(PROJECT_ROOT, 'ALPHONSO_GROUND_TRUTH.generated.md');
const OUTPUT_JSON = join(PROJECT_ROOT, 'alphonso-ground-truth.snapshot.json');
const GROUND_TRUTH_MD = join(PROJECT_ROOT, 'docs', 'ALPHONSO_GROUND_TRUTH.md');

const failOnDrift = process.argv.includes('--fail-on-drift');

async function fetchJson(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function probeOllama(endpoint) {
  const tags = await fetchJson(`${endpoint}/api/tags`, { method: 'GET' }, 3000);
  if (!tags.ok) {
    return { ok: false, endpoint, error: tags.error || `HTTP ${tags.status}` };
  }
  const models = Array.isArray(tags.data?.models) ? tags.data.models : [];
  return {
    ok: true,
    endpoint,
    reachable: true,
    modelCount: models.length,
    models: models.map((m) => m?.name).filter(Boolean).slice(0, 25)
  };
}

function probeNotion() {
  const fromVite = (typeof process !== 'undefined' && process.env?.VITE_NOTION_API_KEY) || '';
  const fromNode = process.env?.NOTION_API_KEY || '';
  const tokenPresent = Boolean((fromVite && fromVite !== 'YOUR_NOTION_API_KEY_HERE') || (fromNode && fromNode !== 'YOUR_NOTION_API_KEY_HERE'));
  const parentIdPresent = Boolean(process.env?.NOTION_PARENT_PAGE_ID && process.env.NOTION_PARENT_PAGE_ID !== 'YOUR_NOTION_PARENT_PAGE_ID_HERE');
  const databaseIdPresent = Boolean(process.env?.VITE_NOTION_DATABASE_ID && process.env.VITE_NOTION_DATABASE_ID !== 'YOUR_NOTION_DATABASE_ID_HERE');
  return {
    tokenPresent,
    parentIdPresent,
    databaseIdPresent,
    note: tokenPresent
      ? 'credentials present in env (token value not inspected)'
      : 'no Notion credentials in env (treat as offline)'
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const ollama = await probeOllama('http://127.0.0.1:11434');
  const notion = probeNotion();
  const counts = getAllCounts();

  // Derived: the actual current test count (only meaningful after a test run)
  let testCount = null;
  let testFilesCount = null;
  const vitestOut = join(PROJECT_ROOT, 'docs', 'handoff', 'ALPHONSO_VITEST_LAST.json');
  if (existsSync(vitestOut)) {
    try {
      const parsed = JSON.parse(readFileSync(vitestOut, 'utf8'));
      testCount = parsed?.numTotalTests ?? null;
      testFilesCount = parsed?.numTotalTestFiles ?? null;
    } catch {
      // ignore — not a hard failure
    }
  }

  // Hardcoded drift claims for the values OpenCode audits by hand
  const DRIFT_CLAIMS = [
    { key: 'lib_rs_lines', label: 'src-tauri/src/lib.rs lines', claim: 4642, actual: counts.libRs.nonEmptyLines },
    { key: 'js_test_files', label: 'JS test files (src/test, .js)', claim: 65, actual: counts.tests.js },
    { key: 'service_files', label: 'Service files (src/services)', claim: null, actual: counts.services.files },
    { key: 'component_files', label: 'Component files (src/components)', claim: null, actual: counts.components.files },
    { key: 'agent_files', label: 'Agent profile files (src/agents)', claim: null, actual: counts.agents.files },
    { key: 'rust_source_files', label: 'Rust source files (src-tauri/src)', claim: null, actual: counts.rustSource.files },
    { key: 'tauri_commands', label: 'Tauri commands', claim: null, actual: counts.tauriCommands },
    { key: 'rust_tests', label: 'Rust unit tests', claim: null, actual: counts.rustTests },
    { key: 'script_files', label: 'Script files (scripts/)', claim: null, actual: counts.scripts.files }
  ];

  const drift = DRIFT_CLAIMS.map((entry) => {
    const driftDetected = entry.claim !== null && entry.claim !== undefined && entry.actual !== entry.claim;
    return { key: entry.key, label: entry.label, claim: entry.claim, actual: entry.actual, drift: driftDetected };
  });

  const generated = {
    generatedAt: startedAt,
    schema: 'alphonso.ground_truth.v1',
    counters: {
      lib_rs_lines: counts.libRs.nonEmptyLines,
      rust_source: counts.rustSource,
      services: counts.services,
      components: counts.components,
      agents: counts.agents,
      scripts: counts.scripts,
      tests: counts.tests,
      vitest_last: testCount ? { tests: testCount, files: testFilesCount } : null
    },
    runtime: {
      ollama,
      notion
    },
    drift: drift.filter((d) => d.drift).map((d) => ({ key: d.key, label: d.label, claim: d.claim, actual: d.actual })),
    drift_full: drift,
    ground_truth_path: relative(PROJECT_ROOT, GROUND_TRUTH_MD),
    ground_truth_exists: existsSync(GROUND_TRUTH_MD),
    ground_truth_size: existsSync(GROUND_TRUTH_MD) ? statSync(GROUND_TRUTH_MD).size : 0
  };

  const summary = {
    generatedAt: generated.generatedAt,
    counters: {
      lib_rs_lines: generated.counters.lib_rs_lines,
      rust_files: generated.counters.rust_source.files,
      services_total: generated.counters.services.files,
      components: generated.counters.components.files,
      agents: generated.counters.agents.files,
      scripts: generated.counters.scripts.files,
      test_files: generated.counters.tests.files,
      test_lines: generated.counters.tests.lines
    },
    ollamaReachable: ollama.ok,
    ollamaModelCount: ollama.ok ? ollama.modelCount : 0,
    notionWired: notion.tokenPresent,
    driftCount: generated.drift.length
  };

  // Build the markdown artifact
  const lines = [];
  lines.push('# Alphonso — Generated Ground Truth');
  lines.push('');
  lines.push(`> Auto-generated by \`scripts/export-ground-truth.mjs\` on ${startedAt}.`);
  lines.push('> Do not hand-edit — regenerate with `npm run export:ground-truth`.');
  lines.push('> Hand-edited source of record: `docs/ALPHONSO_GROUND_TRUTH.md`.');
  lines.push('');
  lines.push('## Counters (from repo)');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| src-tauri/src/lib.rs lines | **${generated.counters.lib_rs_lines}** |`);
  lines.push(`| Rust source files (src-tauri/src) | ${generated.counters.rust_source.files} |`);
  lines.push(`| Service files (src/services) | ${generated.counters.services.files} (js=${generated.counters.services.js}, ts=${generated.counters.services.ts}) |`);
  lines.push(`| Service lines (src/services) | ${generated.counters.services.lines} |`);
  lines.push(`| Component files (src/components) | ${generated.counters.components.files} |`);
  lines.push(`| Agent profile files (src/agents) | ${generated.counters.agents.files} |`);
  lines.push(`| Node script files (scripts) | ${generated.counters.scripts.files} |`);
  lines.push(`| JS test files (src/test, .js) | ${generated.counters.tests.js} |`);
  lines.push(`| JSX test files (src/test, .jsx) | ${generated.counters.tests.jsx} |`);
  lines.push(`| TS test files (src/test, .ts) | ${generated.counters.tests.ts} |`);
  lines.push(`| Test files total (src/test) | ${generated.counters.tests.files} |`);
  if (generated.counters.vitest_last) {
    lines.push(`| Last vitest run | ${generated.counters.vitest_last.tests} tests across ${generated.counters.vitest_last.files} files |`);
  } else {
    lines.push('| Last vitest run | (not recorded — run `npm run test` to populate `docs/handoff/ALPHONSO_VITEST_LAST.json`) |');
  }
  lines.push('');
  lines.push('## Runtime status');
  lines.push('');
  lines.push(`- **Ollama** (${ollama.endpoint}): ${ollama.ok ? `reachable, ${ollama.modelCount} model(s)` : `not reachable (${ollama.error || 'no response'})`}`);
  if (ollama.ok && ollama.models?.length) {
    lines.push(`  - models: ${ollama.models.join(', ')}`);
  }
  lines.push(`- **Notion**: ${notion.tokenPresent ? 'credentials present (token value not inspected)' : 'no credentials in env (offline)'}`);
  if (notion.parentIdPresent) lines.push('  - parent page id present');
  if (notion.databaseIdPresent) lines.push('  - database id present');
  lines.push('');
  lines.push('## Drift vs ground truth');
  lines.push('');
  if (generated.drift.length === 0) {
    lines.push('No drift detected on the claims audited by this script.');
  } else {
    lines.push('| Key | Claim | Actual |');
    lines.push('|---|---|---|');
    for (const d of generated.drift) {
      lines.push(`| ${d.label} | ${d.claim} | ${d.actual} |`);
    }
  }
  lines.push('');
  lines.push('## Hand-edited source');
  lines.push('');
  lines.push(`- \`${relative(PROJECT_ROOT, GROUND_TRUTH_MD)}\` (${generated.ground_truth_size} bytes) — operator-edited source of record.`);
  lines.push('- `ALPHONSO_GROUND_TRUTH.generated.md` (this file) — repo-derived snapshot. Regenerate with `npm run export:ground-truth`.');
  lines.push('- `alphonso-ground-truth.snapshot.json` — machine-readable companion to this file.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`Generated at ${startedAt}. Schema: alphonso.ground_truth.v1.`);
  lines.push('');

  mkdirSync(dirname(OUTPUT_MD), { recursive: true });
  writeFileSync(OUTPUT_MD, lines.join('\n'), 'utf8');
  writeFileSync(OUTPUT_JSON, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');

  // Console summary
  const out = {
    outputMarkdown: relative(PROJECT_ROOT, OUTPUT_MD),
    outputJson: relative(PROJECT_ROOT, OUTPUT_JSON),
    summary
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (generated.drift.length > 0) {
    process.stdout.write('\n[drift] detected claims that differ from the audited values:\n');
    for (const d of generated.drift) {
      process.stdout.write(`  - ${d.label}: claim=${d.claim} actual=${d.actual}\n`);
    }
    if (failOnDrift) {
      process.stdout.write('\n[drift] --fail-on-drift is set, exiting with code 1.\n');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[export-ground-truth] Failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});
