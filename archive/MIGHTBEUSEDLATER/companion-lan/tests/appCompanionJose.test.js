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

  it('runs a schedule through runScheduledCommand (phase 6a)', () => {
    const start = app.indexOf('runCommand: async (commandText)');
    const block = app.slice(start, app.indexOf('onResult:', start));
    expect(block).toContain('runScheduledCommand(');
    expect(block).not.toContain('runJoseCommandExecutionPipeline(');
  });
});
