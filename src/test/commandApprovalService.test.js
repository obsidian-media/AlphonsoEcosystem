import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isWorkspaceCodeExecuting,
  requestWorkspaceCommandApproval,
  setCommandApprovalHandler
} from '../services/commandApprovalService';
import { needsHighRiskApproval } from '../lib/chatUtils';

describe('isWorkspaceCodeExecuting', () => {
  it.each([
    ['npm', ['run', 'build']],
    ['npm', ['test']],
    ['npm', ['install']],
    ['npm.cmd', ['ci']],
    ['pnpm', ['add', 'left-pad']],
    ['npx', ['vitest']],
    ['npx', ['eslint', '.']],
    ['cargo', ['build']],
    ['cargo', ['check']],
    ['cargo', ['test']],
    ['python', ['-m', 'pytest']],
    ['python3', ['-m', 'pip', 'install', 'x']],
    ['pip', ['install', 'x']],
    ['some-unknown-tool', []]
  ])('requires approval: %s %j', (program, args) => {
    expect(isWorkspaceCodeExecuting(program, args)).toBe(true);
  });

  it.each([
    ['git', ['status']],
    ['git', ['commit', '-m', 'x']],
    ['npm', ['audit']],
    ['npm', ['--version']],
    ['npx', ['tsc', '--noEmit']],
    ['cargo', ['fmt']],
    ['cargo', ['--version']],
    ['python', ['-m', 'py_compile', 'a.py']],
    ['python', ['--version']],
    ['node', ['--check', 'a.js']],
    ['ollama', ['list']]
  ])('does not require approval: %s %j', (program, args) => {
    expect(isWorkspaceCodeExecuting(program, args)).toBe(false);
  });
});

describe('requestWorkspaceCommandApproval', () => {
  beforeEach(() => setCommandApprovalHandler(null));

  it('needs no approval for inspection-only commands and never calls the handler', async () => {
    const handler = vi.fn(async () => true);
    setCommandApprovalHandler(handler);
    const out = await requestWorkspaceCommandApproval([{ program: 'git', args: ['status'] }]);
    expect(out).toMatchObject({ approved: true, reason: 'not_required', gated: [] });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed when a gated command has no registered handler', async () => {
    const out = await requestWorkspaceCommandApproval([{ program: 'npm', args: ['run', 'build'] }]);
    expect(out).toMatchObject({ approved: false, reason: 'no_handler' });
  });

  it('asks once for the whole gated set and labels it as high-risk workspace code', async () => {
    const handler = vi.fn(async () => true);
    setCommandApprovalHandler(handler);
    const out = await requestWorkspaceCommandApproval(
      [
        { program: 'npm', args: ['install'] },
        { program: 'git', args: ['status'] },
        { program: 'npm', args: ['test'] }
      ],
      { source: 'AI-planned', projectDir: '/proj' }
    );
    expect(out).toMatchObject({ approved: true, reason: 'approved' });
    expect(out.gated).toHaveLength(2);
    expect(handler).toHaveBeenCalledTimes(1);
    const req = handler.mock.calls[0][0];
    expect(req.riskLevel).toBe('high');
    expect(req.actionLabel).toContain('npm install');
    expect(req.actionLabel).toContain('npm test');
    expect(req.actionLabel).not.toContain('git status');
    // The shell's requestApproval only prompts for labels this predicate flags.
    expect(needsHighRiskApproval(req.actionLabel)).toBe(true);
  });

  it('treats a denial, a rejecting handler and a non-true result as denied', async () => {
    const cmds = [{ program: 'cargo', args: ['test'] }];
    setCommandApprovalHandler(async () => false);
    expect((await requestWorkspaceCommandApproval(cmds)).reason).toBe('denied');
    setCommandApprovalHandler(async () => { throw new Error('ui crashed'); });
    expect((await requestWorkspaceCommandApproval(cmds)).approved).toBe(false);
    setCommandApprovalHandler(async () => 'yes');
    expect((await requestWorkspaceCommandApproval(cmds)).approved).toBe(false);
  });

  it('reuses a cached decision for an identical command set within one run', async () => {
    const handler = vi.fn(async () => true);
    setCommandApprovalHandler(handler);
    const cache = new Map();
    const cmds = [{ program: 'npm', args: ['run', 'build'] }];
    await requestWorkspaceCommandApproval(cmds, { source: 'x', cache });
    const second = await requestWorkspaceCommandApproval(cmds, { source: 'x', cache });
    expect(second.approved).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
