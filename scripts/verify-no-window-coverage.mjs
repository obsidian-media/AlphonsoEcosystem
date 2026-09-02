#!/usr/bin/env node
/**
 * Alphonso — CREATE_NO_WINDOW Coverage Verifier (T14)
 *
 * Every `std::process::Command::new(...)` / `tokio::process::Command::new(...)`
 * spawn site in src-tauri/src must apply the shared no_window()/no_window_async()
 * guard (or an equivalent inline CREATE_NO_WINDOW/creation_flags call), or a
 * visible CMD window flashes open/closed on Windows for that spawn. This has
 * been a recurring real bug (see CLAUDE.md's "CREATE_NO_WINDOW on all Windows
 * process spawns" entry) — this check exists so a new unprotected spawn site
 * is caught in CI instead of relying on someone remembering the convention.
 *
 * Heuristic: for each Command::new(/TokioCommand::new( match, scan forward up
 * to LOOKAHEAD_LINES (or until the next Command::new/TokioCommand::new call,
 * whichever comes first) for a no_window/no_window_async/CREATE_NO_WINDOW/
 * creation_flags token. A bare `Command::new("kill")` / `Command::new("ps")`
 * literal is exempt — these are POSIX-only tools that never run on Windows,
 * so the flag is meaningless for them (mirrors the existing unix-only
 * branches in commands/system.rs and runtime_manager.rs).
 */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { walk, PROJECT_ROOT, byExt, RUST_EXT } from './shared/counters.mjs';

const LOOKAHEAD_LINES = 30;
const SPAWN_RE = /\b(?:Tokio)?Command::new\(/;
const GUARD_RE = /no_window(?:_async)?\(|CREATE_NO_WINDOW|creation_flags\(/;
const UNIX_ONLY_LITERAL_RE = /Command::new\(\s*"(kill|ps|which)"\s*\)/;

const rustDir = join(PROJECT_ROOT, 'src-tauri', 'src');
const rustFiles = walk(rustDir, byExt(RUST_EXT));

const findings = [];

for (const file of rustFiles) {
  // utils.rs defines the helpers themselves — its own creation_flags call is
  // the implementation, not a spawn site needing verification.
  if (file.endsWith(`utils.rs`) || file.endsWith(`utils${'\\'}rs`)) continue;
  const rel = relative(PROJECT_ROOT, file).replaceAll('\\', '/');
  if (rel.endsWith('src-tauri/src/utils.rs')) continue;

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!SPAWN_RE.test(lines[i])) continue;
    if (UNIX_ONLY_LITERAL_RE.test(lines[i])) continue;

    const windowEnd = Math.min(lines.length, i + 1 + LOOKAHEAD_LINES);
    let guarded = false;
    for (let j = i; j < windowEnd; j++) {
      if (j !== i && SPAWN_RE.test(lines[j])) break; // next spawn site, stop looking
      if (GUARD_RE.test(lines[j])) {
        guarded = true;
        break;
      }
    }

    if (!guarded) {
      findings.push({ file: rel, line: i + 1, code: lines[i].trim() });
    }
  }
}

if (findings.length > 0) {
  console.error(`\n[verify-no-window-coverage] Found ${findings.length} unprotected process spawn site(s):`);
  findings.forEach((f) => console.error(`  - ${f.file}:${f.line}  ${f.code}`));
  console.error(
    '\nApply crate::utils::no_window(&mut cmd) (std::process::Command) or ' +
      'crate::utils::no_window_async(&mut cmd) (tokio::process::Command) before ' +
      '.spawn()/.output()/.status() — see src-tauri/src/utils.rs.'
  );
  process.exit(1);
} else {
  console.log('[verify-no-window-coverage] All process spawns apply CREATE_NO_WINDOW. ✓');
  process.exit(0);
}
