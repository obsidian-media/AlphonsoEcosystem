import { describe, it, expect, vi, beforeEach } from 'vitest';

const PKG = JSON.stringify({ dependencies: { react: '1', vite: '1' } });

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd, args) => {
    if (cmd === 'read_workspace_file') {
      return { content: args.relativePath === 'package.json' ? PKG : null };
    }
    return { findings: [] };
  })
}));
vi.mock('../../lib/ollama', () => ({
  generateOllamaStream: vi.fn(),
  generateAgentLlmResponse: vi.fn(async () => ({
    response: JSON.stringify({
      plan: 'p',
      files: [{ path: 'src/a.js', content: 'x' }],
      commands: [
        { program: 'npm', args: ['run', 'build'] },
        { program: 'git', args: ['status'] }
      ]
    })
  }))
}));
vi.mock('../../services/verificationService', () => ({
  verifyCommandExecution: vi.fn(async () => ({ payload: { success: true, exitCode: 0 } }))
}));
vi.mock('../../services/workspaceArtifactService', () => ({ writeWorkspaceArtifact: vi.fn(async () => ({})) }));
vi.mock('../../services/trustModel', () => ({
  timestampMs: () => Date.now(),
  TRUST_STATES: { VERIFIED: 'verified', INFERRED: 'inferred', UNVERIFIED: 'unverified', FAILED: 'failed' }
}));
vi.mock('../../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../../services/modelSelectionService', () => ({ getModelForTask: vi.fn(() => 'llama3') }));
vi.mock('../../services/autoRunService', () => ({ autoRunDevServer: vi.fn(), getAutoRunEnabled: vi.fn(() => false) }));
vi.mock('../../services/composioService', () => ({ isComposioEnabled: vi.fn(() => false), executeViaComposio: vi.fn() }));
vi.mock('../../services/agentMetricsService', () => ({ recordAgentExecution: vi.fn() }));
vi.mock('../../services/toolRegistryService', () => ({
  getToolDefinitions: vi.fn(() => []),
  formatToolsForPrompt: vi.fn(() => ''),
  executeTool: vi.fn(async () => ({ success: true }))
}));

import { executeWithBrain, sanitizeRelativePath } from '../../services/agentBrainService';
import { verifyCommandExecution } from '../../services/verificationService';
import { setCommandApprovalHandler } from '../../services/commandApprovalService';

const run = () =>
  executeWithBrain('create a react dashboard with login page and charts for sales', {
    endpoint: 'http://localhost:11434',
    projectDirectory: '/proj'
  });

const ran = () => verifyCommandExecution.mock.calls.map(([p, a]) => `${p} ${a.join(' ')}`);

describe('executeWithBrain: AI-planned workspace-code commands need approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setCommandApprovalHandler(null);
  });

  it('runs nothing that executes workspace code when no approval handler exists (fail closed)', async () => {
    const out = await run();
    expect(ran().filter((c) => c.startsWith('npm'))).toEqual([]);
    expect(out.artifacts.some((a) => a.type === 'command_not_approved' && a.reason === 'no_handler')).toBe(true);
    expect(out.artifacts.some((a) => a.type === 'validation_skipped')).toBe(true);
    expect(out.artifacts.some((a) => a.type === 'validation_passed')).toBe(false);
    // inspection-only commands are unaffected
    expect(ran()).toContain('git status');
  });

  it('does not run gated commands when the user denies, but still runs inspection commands', async () => {
    const handler = vi.fn(async () => false);
    setCommandApprovalHandler(handler);
    const out = await run();
    expect(handler).toHaveBeenCalled();
    expect(ran().filter((c) => c.startsWith('npm'))).toEqual([]);
    expect(ran()).toContain('git status');
    expect(out.results.some((r) => r.startsWith('Command not run'))).toBe(true);
  });

  it('runs the planned and validation commands once the user approves', async () => {
    setCommandApprovalHandler(vi.fn(async () => true));
    const out = await run();
    expect(ran().filter((c) => c === 'npm run build').length).toBeGreaterThanOrEqual(1);
    expect(out.artifacts.some((a) => a.type === 'command_not_approved')).toBe(false);
  });
});

describe('sanitizeRelativePath: .git is off-limits', () => {
  it('rejects any path through a .git directory, case-insensitively', () => {
    expect(sanitizeRelativePath('.git/hooks/pre-commit')).toBeNull();
    expect(sanitizeRelativePath('.git/config')).toBeNull();
    expect(sanitizeRelativePath('sub/.GIT/config')).toBeNull();
    expect(sanitizeRelativePath('.gitignore')).toBe('.gitignore');
    expect(sanitizeRelativePath('.github/workflows/ci.yml')).toBe('.github/workflows/ci.yml');
  });
});
