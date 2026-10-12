// The supervised command policy (src-tauri/src/policy_gate.rs) is the real
// boundary for AI-planned commands. These checks call the real Tauri command
// and confirm refused forms are refused by the backend itself, not by UI code.
import { enterShell, invoke } from '../helpers.mjs';

const run = (program, args) => invoke('execute_command_verified', { program, args, cwd: null });

describe('Alphonso desktop command policy', () => {
  before(enterShell);

  it('refuses a program that is not on the allowlist', async () => {
    const result = await run('curl', ['https://example.com']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('refuses inline code execution through an allowed program', async () => {
    for (const [program, args] of [
      ['node', ['-e', 'process.exit(0)']],
      ['python', ['-c', 'pass']],
    ]) {
      const result = await run(program, args);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not permitted');
    }
  });

  it('refuses git config injection', async () => {
    const result = await run('git', ['-c', 'core.sshCommand=calc', 'status']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not permitted');
  });

  it('runs an allowed read-only command and returns a proof', async () => {
    const result = await run('git', ['status']);
    expect(result.ok).toBe(true);
    expect(result.value.program).toBe('git');
  });
});
