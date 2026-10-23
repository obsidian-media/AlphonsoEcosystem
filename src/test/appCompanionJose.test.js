import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 6a: the phone companion goes through Jose's one entry, not the pipeline.
const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

describe('App: phone companion commands', () => {
  it('hands every companion command to handleCompanionCommand', () => {
    const start = app.indexOf("listen('companion://command'");
    expect(start).toBeGreaterThan(-1);
    const handler = app.slice(start, app.indexOf("listen('companion://abort'", start));
    expect(handler).toContain('handleCompanionCommand(');
    expect(handler).not.toContain('runJoseCommandExecutionPipeline(');
  });
});
