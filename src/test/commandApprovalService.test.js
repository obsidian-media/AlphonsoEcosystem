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

  // Settings → Approvals (2026-10-23): "Run code and commands" decides whether
  // code-running commands ask; deleting is locked and always asks.
  it('does not ask for code-running commands when Settings says not to', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ effectApprovals: { run: false } }));
    const handler = vi.fn(async () => true);
    setCommandApprovalHandler(handler);
    const out = await requestWorkspaceCommandApproval([{ program: 'npm', args: ['run', 'build'] }]);
    expect(out).toMatchObject({ approved: true, reason: 'not_required_by_settings' });
    expect(handler).not.toHaveBeenCalled();
    localStorage.removeItem('alphonso_settings');
  });

  it('always asks before a command that deletes, as a locked question', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ effectApprovals: { run: false } }));
    const handler = vi.fn(async () => false);
    setCommandApprovalHandler(handler);
    const out = await requestWorkspaceCommandApproval([{ program: 'git', args: ['reset', '--hard'] }, { program: 'npm', args: ['test'] }]);
    expect(out).toMatchObject({ approved: false, reason: 'denied' });
    expect(out.gated.map((c) => c.program)).toEqual(['git']);
    expect(handler.mock.calls[0][0]).toMatchObject({ alwaysAsk: true, requireApproval: true });
    expect(handler.mock.calls[0][0].actionLabel).toContain('git reset --hard');
    localStorage.removeItem('alphonso_settings');
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

// owner, 2026-10-22: the rating comes from what the command does.
import { assessCommandRisk } from '../services/commandApprovalService';

describe('assessCommandRisk', () => {
  it('rates read-only commands low and lets them run without asking', () => {
    for (const [p, a] of [['ollama', ['list']], ['git', ['status']], ['npm.cmd', ['--version']], ['tasklist', []], ['where.exe', ['ollama']]]) {
      const r = assessCommandRisk(p, a);
      expect(r.level, `${p} ${a.join(' ')}`).toBe('low');
      expect(r.readOnly).toBe(true);
    }
  });

  it('rates commands that run project code high, with the reason', () => {
    const r = assessCommandRisk('npm.cmd', ['run', 'build']);
    expect(r.level).toBe('high');
    expect(r.readOnly).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Runs code from your project folder/);
  });

  it('rates changes and downloads medium, and deletions high', () => {
    expect(assessCommandRisk('ollama', ['pull', 'qwen3:0.6b']).level).toBe('medium');
    expect(assessCommandRisk('git', ['commit', '-m', 'x']).level).toBe('medium');
    expect(assessCommandRisk('ollama', ['rm', 'qwen3:0.6b']).level).toBe('high');
    expect(assessCommandRisk('git', ['reset', '--hard']).level).toBe('high');
  });

  it('rates an unknown program high (fail closed)', () => {
    const r = assessCommandRisk('mystery-tool', ['--go']);
    expect(r.level).toBe('high');
    expect(r.reasons.join(' ')).toMatch(/does not know/);
  });
});

// Agent phase 4: the approval window lists Sentinel's exact checks of each command.
describe("Sentinel's exact checks in the command approval", () => {
  beforeEach(() => setCommandApprovalHandler(null));
  it("each command's exact checks are in the approval reasons", async () => {
    const handler = vi.fn(async () => true);
    setCommandApprovalHandler(handler);
    await requestWorkspaceCommandApproval([{ program: 'git', args: ['clean', '-fd'] }, { program: 'npm', args: ['run', 'test'] }]);
    const reasons = handler.mock.calls[0][0].riskReasons;
    expect(reasons).toContain('Sentinel: deletes files: git clean -fd');
    expect(reasons).toContain('Sentinel: runs code: npm run test');
  });
});
