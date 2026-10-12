/**
 * Per-command approval for AI-planned commands that execute workspace code.
 *
 * `policy_gate.rs` is the hard boundary for *which* programs/arguments may run
 * at all. It deliberately still allows `npm run/test/build`, `cargo build/test`,
 * `python -m pytest` and friends, because Jose's code-generation flow needs
 * them. Those commands execute scripts that live in the project folder -- files
 * the AI may have just written, or that a prompt-injected README told it to
 * write (CWE-94). This service puts a human decision in front of exactly that
 * class of command, without touching read-only/inspection commands.
 *
 * Fail-closed: if a command needs approval and no approval handler has been
 * registered (headless/test contexts), it is denied, never silently allowed.
 * When the user has turned Approval Mode off in Settings, the registered
 * handler (App's `requestApproval`) approves immediately -- the same explicit,
 * user-owned opt-out every other high-risk action honors.
 */

export interface PlannedCommand {
  program: string;
  args: string[];
}

export interface CommandApprovalRequest {
  actionLabel: string;
  agent: string;
  riskLevel: 'high';
}

export type CommandApprovalHandler = (request: CommandApprovalRequest) => Promise<boolean>;

export type CommandApprovalOutcome = {
  approved: boolean;
  /** Commands that were subject to approval (empty when none needed it). */
  gated: PlannedCommand[];
  reason: 'not_required' | 'approved' | 'denied' | 'no_handler';
};

let handler: CommandApprovalHandler | null = null;

export function setCommandApprovalHandler(next: CommandApprovalHandler | null): void {
  handler = next;
}

function baseProgram(program: string): string {
  return String(program || '')
    .trim()
    .toLowerCase()
    .replace(/\.(exe|cmd)$/, '');
}

function firstArg(args: string[]): string {
  return String(args?.[0] ?? '').toLowerCase();
}

/**
 * True when running this command executes code from the workspace (package
 * scripts, build scripts, test files, project config) -- or when we cannot say
 * it does not. Unknown programs are treated as code-executing (fail closed).
 */
export function isWorkspaceCodeExecuting(program: string, args: string[] = []): boolean {
  const prog = baseProgram(program);
  const first = firstArg(args);

  switch (prog) {
    case 'npm':
    case 'yarn':
    case 'pnpm':
      // audit/outdated/version only read metadata; everything else runs
      // lifecycle scripts (install -> postinstall, run/test/build -> scripts).
      return !['audit', 'outdated', '--version', '-v'].includes(first);
    case 'npx':
      // `tsc` type-checks without executing project code; vite/vitest/eslint/
      // prettier all load project config or plugins.
      return first !== 'tsc';
    case 'cargo':
      // build/check/test/clippy/doc run build.rs and proc-macros; fmt, update,
      // audit, clean and version do not.
      return !['fmt', 'update', 'audit', 'clean', '--version'].includes(first);
    case 'python':
    case 'python3':
    case 'pythonw': {
      if (first === '--version' || first === '-v') return false;
      if (first !== '-m') return true;
      const mod = String(args?.[1] ?? '').toLowerCase();
      // py_compile/compileall parse but do not run; venv only creates a dir.
      return !['py_compile', 'compileall', 'venv'].includes(mod);
    }
    case 'pip':
    case 'pip3':
      // installing an sdist can run setup.py
      return !['--version', '-v', 'list', 'show', 'freeze'].includes(first);
    case 'node':
      // policy_gate only permits --check/-c/--version, none of which execute
      return !['--check', '-c', '--version', '-v'].includes(first);
    case 'git':
    case 'rustc':
    case 'ollama':
    case 'ffmpeg':
    case 'ffprobe':
      // Not workspace-code runners; policy_gate restricts their arguments.
      return false;
    default:
      return true;
  }
}

function describe(command: PlannedCommand): string {
  return [command.program, ...(command.args || [])].join(' ').slice(0, 160);
}

/**
 * Ask the user to approve the code-executing subset of `commands`.
 * `cache` lets one agent run reuse a decision for an identical command set
 * instead of re-prompting every iteration.
 */
export async function requestWorkspaceCommandApproval(
  commands: PlannedCommand[],
  context: { source: string; projectDir?: string; cache?: Map<string, boolean> } = { source: 'AI-planned' }
): Promise<CommandApprovalOutcome> {
  const gated = (commands || []).filter(
    (c) => c && typeof c.program === 'string' && isWorkspaceCodeExecuting(c.program, Array.isArray(c.args) ? c.args : [])
  );
  if (gated.length === 0) return { approved: true, gated, reason: 'not_required' };

  const key = gated.map(describe).join('\n');
  const cached = context.cache?.get(key);
  if (cached !== undefined) {
    return { approved: cached, gated, reason: cached ? 'approved' : 'denied' };
  }

  if (!handler) return { approved: false, gated, reason: 'no_handler' };

  const where = context.projectDir ? ` in ${context.projectDir}` : '';
  // "run workspace code" is a high-risk term in needsHighRiskApproval().
  const actionLabel = `Run workspace code (${context.source})${where}: ${gated.map(describe).join(' ; ')}`;

  let approved = false;
  try {
    approved = (await handler({ actionLabel, agent: 'alphonso', riskLevel: 'high' })) === true;
  } catch {
    approved = false; // a failing approval UI must never read as consent
  }
  context.cache?.set(key, approved);
  return { approved, gated, reason: approved ? 'approved' : 'denied' };
}
