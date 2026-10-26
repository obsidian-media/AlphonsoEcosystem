// What Maria reads (agent phase 3): the sources and files the work was built from,
// following the work's own links up to three steps back.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { createJoseRequest } from '../../../services/jose/joseRequestStore';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';
import { workSteps, workSources, workFiles, workResults, NO_SOURCES } from '../../../services/maria/workContext';

const CMD = 'jose-command-1-maria';
const step = (stepId: string, agent: string, needs: string[] = []) => ({ stepId, agent, actionType: 'x', effects: ['read'], needs, status: 'done' });
const SOURCES = [{ n: 1, title: 'Bees', url: 'https://bees.example', label: 'read', excerpt: 'Bees beat their wings 11,400 times a minute.' }];

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  createJoseRequest({ commandId: CMD, source: 'user', text: 'Research, write, check', steps: [step('hector', 'hector'), step('nova', 'nova', ['hector']), step('write', 'alphonso', ['nova']), step('far', 'alphonso', ['write']), step('check', 'maria', ['far'])] } as never);
  setStepOutput(CMD, 'hector', 'hector', { summary: 'Bees beat their wings fast [1].', schema: { sources: SOURCES } });
  setStepOutput(CMD, 'nova', 'nova', { summary: 'What to do first: the post.' });
  setStepOutput(CMD, 'write', 'alphonso', { summary: 'A post.', artifacts: [{ type: 'file', relativePath: 'src/a.ts' }, { type: 'file', relativePath: 'src/b.ts' }, { type: 'final_validation_failed', errors: [{ label: 'npm run build', output: 'TS2304: Cannot find name x' }] }] });
});

describe('workSteps', () => {
  it('follows the work back, nearest first', () => {
    expect(workSteps(CMD, 'write')).toEqual(['write', 'nova', 'hector']);
  });

  it('stops after three steps', () => {
    expect(workSteps(CMD, 'far')).toEqual(['far', 'write', 'nova', 'hector'].slice(0, 4));
    expect(workSteps(CMD, 'far', 2)).toEqual(['far', 'write', 'nova']);
  });
});

describe('workSources', () => {
  it("finds Hector's sources through the post", () => {
    expect(workSources(CMD, 'write')).toEqual(SOURCES);
  });

  it('no research step means no sources', () => {
    expect(workSources(CMD, 'nova-missing')).toEqual([]);
    expect(NO_SOURCES).toBe('No earlier step used sources.');
  });
});

describe('workFiles and workResults', () => {
  it('reads the files Alphonso wrote, capped', async () => {
    invoke.mockImplementation(async (_cmd: string, args: { relativePath: string }) => ({ content: args.relativePath === 'src/a.ts' ? 'a'.repeat(9000) : 'export const b = 1;' }));
    const files = await workFiles(CMD, 'write', 'D:/project');
    expect(files[0]).toMatchObject({ path: 'src/a.ts', cut: 3000 });
    expect(files[0].text).toHaveLength(6000);
    expect(files[1]).toMatchObject({ path: 'src/b.ts', text: 'export const b = 1;', cut: 0 });
    expect(invoke).toHaveBeenCalledWith('read_workspace_file', { workspaceRoot: 'D:/project', relativePath: 'src/a.ts' });
  });

  it('keeps all files together under 20,000 characters', async () => {
    setStepOutput(CMD, 'write', 'alphonso', { summary: 'x', artifacts: [1, 2, 3, 4].map((i) => ({ relativePath: `f${i}.ts` })) });
    invoke.mockResolvedValue({ content: 'z'.repeat(6000) });
    const files = await workFiles(CMD, 'write', 'D:/project');
    expect(files.reduce((n, f) => n + f.text.length, 0)).toBeLessThanOrEqual(20000);
  });

  it('collects build and test output', () => {
    expect(workResults(CMD, 'write')).toContain('npm run build: TS2304: Cannot find name x');
  });
});
