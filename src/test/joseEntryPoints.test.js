import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Phase 6b (owner): every caller goes through Jose's entry points
// (submitToJose, answerOrPlan, submitStepsToJose). The old pipeline stays as
// Jose's engine, but nothing outside Jose may call it directly.
const SRC = resolve(__dirname, '..');
const ALLOWED = [
  'services/joseExecutionEngineService.ts',
  'services/joseCommandRouterService.ts',
];
const OLD_ENTRY = /\b(createJoseCommandRoute|runJoseCommandExecutionPipeline)\s*\(/;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [path] : [];
  });
}

describe("Jose's entry points", () => {
  it('only Jose\'s own files call the old pipeline', () => {
    const callers = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replace(/\\/g, '/'))
      .filter((rel) => !ALLOWED.includes(rel) && !rel.startsWith('services/jose/'))
      .filter((rel) => OLD_ENTRY.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(callers).toEqual([]);
  });

  // Jose phase 7: the Workflows panel's Run and the phone's "run workflow" go through Jose.
  it('no screen or App runs workflow tasks outside Jose', () => {
    const callers = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replace(/\\/g, '/'))
      .filter((rel) => rel.startsWith('components/') || rel === 'App.tsx')
      .filter((rel) => /\bexecuteWorkflowTasks\s*\(/.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(callers).toEqual([]);
  });
});
