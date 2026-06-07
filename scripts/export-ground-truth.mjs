#!/usr/bin/env node
/**
 * Alphonso — Ground Truth Auto-Export
 *
 * Single source of truth for repo counters, runtime status, and drift.
 * Writes:
 *   - ALPHONSO_GROUND_TRUTH.generated.md     (operator-readable)
 *   - alphonso-ground-truth.snapshot.json    (machine-readable)
 *
 * Reuses existing services where it can:
 *   - no network writes
 *   - reads Ollama at http://127.0.0.1:11434/api/tags (best-effort, never throws)
 *   - never reads NOTION_API_KEY (only checks presence / length, never logs)
 *
 * Drift detection compares a small set of numeric claims baked into the script
 * (the same ones OpenCode audits by hand). If a claim is wrong, the script
 * prints a `[drift]` line and writes the diff into the generated artifacts.
 * The script does NOT exit non-zero on drift — drift is informational.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const OUTPUT_MD = join(PROJECT_ROOT, 'ALPHONSO_GROUND_TRUTH.generated.md');
const OUTPUT_JSON = join(PROJECT_ROOT, 'alphonso-ground-truth.snapshot.json');
const GROUND_TRUTH_MD = join(PROJECT_ROOT, 'docs', 'ALPHONSO_GROUND_TRUTH.md');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.opencode', '.vscode', '.idea', 'target', 'release-artifacts', 'coverage']);
const RUST_FILE_EXT = new Set(['.rs']);
const JS_FILE_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const TS_FILE_EXT = new Set(['.ts', '.tsx']);

function walk(dir, predicate, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.opencode') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, results);
    } else if (entry.isFile()) {
      if (predicate(full)) results.push(full);
    }
  }
  return results;
}

function countLines(path) {
  try {
    const text = readFileSync(path, 'utf8');
    if (text.length === 0) return 0;
    // Count non-empty lines, matching what humans read in an editor
    return text.split(/\r?\n/).filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

function byExt(extensions) {
  return (path) => extensions.has(extname(path).toLowerCase());
}

function countInDir(relDir, predicate) {
  const full = join(PROJECT_ROOT, relDir);
  if (!existsSync(full)) return { files: 0, lines: 0, paths: [] };
  const files = walk(full, predicate);
  const lines = files.reduce((acc, f) => acc + countLines(f), 0);
  return { files: files.length, lines, paths: files.map((f) => relative(PROJECT_ROOT, f)) };
}

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
  // NEVER log the token, never read its value, never include it in output.
  const fromVite = (typeof process !== 'undefined' && process.env?.VITE_NOTION_API_KEY) || '';
  const fromNode = process.env?.NOTION_API_KEY || '';
  const tokenPresent = Boolean((fromVite && fromVite !== 'YOUR_NOTION_API_KEY_HERE') || (fromNode && fromNode !== 'YOUR_NOTION_API_KEY_HERE'));
  const parentIdPresent = Boolean(process.env?.NOTION_PARENT_PAGE_ID && process.env.NOTION_PARENT_PAGE_ID !== 'YOUR_NOTION_PARENT_PAGE_ID_HERE');
  const databaseIdPresent = Boolean(process.env?.VITE_NOTION_DATABASE_ID && process.env.VITE_NOTION_DATABASE_ID !== 'YOUR_NOTION_DATABASE_ID_HERE');
  return {
    tokenPresent,
    parentIdPresent,
    databaseIdPresent,
    // explicit booleans only — value never leaves the process
    note: tokenPresent
      ? 'credentials present in env (token value not inspected)'
      : 'no Notion credentials in env (treat as offline)'
  };
}

const DRIFT_CLAIMS = [
  { key: 'lib_rs_lines', label: 'src-tauri/src/lib.rs lines', claim: 4642, actual: null, how: () => countLines(join(PROJECT_ROOT, 'src-tauri', 'src', 'lib.rs')) },
  { key: 'js_test_files', label: 'JS test files (src/test, .js only)', claim: 65, actual: null, how: () => countInDir('src/test', byExt(new Set(['.js']))).files },
  { key: 'jsx_test_files', label: 'JSX test files (src/test, .jsx only)', claim: null, actual: null, how: () => countInDir('src/test', byExt(new Set(['.jsx']))).files },
  { key: 'js_test_lines', label: 'JS test lines (src/test)', claim: null, actual: null, how: () => countInDir('src/test', byExt(new Set(['.js']))).lines },
  { key: 'service_files', label: 'service files (src/services)', claim: null, actual: null, how: () => {
      const js = countInDir('src/services', byExt(JS_FILE_EXT));
      const ts = countInDir('src/services', byExt(TS_FILE_EXT));
      return { files: js.files + ts.files, jsFiles: js.files, tsFiles: ts.files, lines: js.lines + ts.lines };
    }
  },
  { key: 'component_files', label: 'component files (src/components)', claim: null, actual: null, how: () => countInDir('src/components', byExt(new Set(['.jsx', '.tsx']))) },
  { key: 'agent_files', label: 'agent profile files (src/agents)', claim: null, actual: null, how: () => {
      const profiles = countInDir('src/agents', byExt(JS_FILE_EXT));
      return { files: profiles.files, lines: profiles.lines };
    }
  },
  { key: 'rust_files', label: 'Rust source files (src-tauri/src)', claim: null, actual: null, how: () => countInDir('src-tauri/src', byExt(RUST_FILE_EXT)) },
  { key: 'script_files', label: 'node script files (scripts)', claim: null, actual: null, how: () => countInDir('scripts', byExt(JS_FILE_EXT)) }
];

async function main() {
  const startedAt = new Date().toISOString();
  const ollama = await probeOllama('http://127.0.0.1:11434');
  const notion = probeNotion();

  const drift = DRIFT_CLAIMS.map((entry) => {
    const result = entry.how();
    let actual;
    let detail;
    if (typeof result === 'object' && result !== null && 'files' in result) {
      actual = result.files;
      detail = result;
    } else {
      actual = result;
    }
    const driftDetected = entry.claim !== null && entry.claim !== undefined && actual !== entry.claim;
    return { key: entry.key, label: entry.label, claim: entry.claim, actual, drift: driftDetected, detail };
  });

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

  const generated = {
    generatedAt: startedAt,
    schema: 'alphonso.ground_truth.v1',
    counters: {
      lib_rs_lines: countLines(join(PROJECT_ROOT, 'src-tauri', 'src', 'lib.rs')),
      rust_files: countInDir('src-tauri/src', byExt(RUST_FILE_EXT)),
      services: (() => {
        const js = countInDir('src/services', byExt(JS_FILE_EXT));
        const ts = countInDir('src/services', byExt(TS_FILE_EXT));
        return { js: js.files, ts: ts.files, total: js.files + ts.files, lines: js.lines + ts.lines };
      })(),
      components: countInDir('src/components', byExt(new Set(['.jsx', '.tsx']))),
      agents: countInDir('src/agents', byExt(JS_FILE_EXT)),
      scripts: countInDir('scripts', byExt(JS_FILE_EXT)),
      js_tests: (() => {
        const js = countInDir('src/test', byExt(new Set(['.js'])));
        const jsx = countInDir('src/test', byExt(new Set(['.jsx'])));
        return { js: js.files, jsx: jsx.files, total: js.files + jsx.files, lines: js.lines };
      })(),
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
    counters: generated.counters,
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
  lines.push(`| Rust source files (src-tauri/src) | ${generated.counters.rust_files.files} |`);
  lines.push(`| Service files (src/services) | ${generated.counters.services.total} (js=${generated.counters.services.js}, ts=${generated.counters.services.ts}) |`);
  lines.push(`| Service lines (src/services) | ${generated.counters.services.lines} |`);
  lines.push(`| Component files (src/components) | ${generated.counters.components.files} |`);
  lines.push(`| Agent profile files (src/agents) | ${generated.counters.agents.files} |`);
  lines.push(`| Node script files (scripts) | ${generated.counters.scripts.files} |`);
  lines.push(`| JS test files (src/test, .js) | ${generated.counters.js_tests.js} |`);
  lines.push(`| JSX test files (src/test, .jsx) | ${generated.counters.js_tests.jsx} |`);
  lines.push(`| Test files total (src/test) | ${generated.counters.js_tests.total} |`);
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
  }
}

main().catch((err) => {
  process.stderr.write(`[export-ground-truth] Failed: ${String(err?.stack || err)}\n`);
  process.exit(1);
});
