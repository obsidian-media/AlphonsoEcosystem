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
 *
 * Settings → Approvals (2026-10-23): the "Run code and commands" row decides
 * whether code-running commands ask. A command that deletes always asks,
 * even with Approval Mode off (`alwaysAsk`), because delete is locked.
 */
import { getEffectApprovals } from './jose/joseEffects';

export interface PlannedCommand {
  program: string;
  args: string[];
}

export type CommandRiskLevel = 'low' | 'medium' | 'high';

export interface CommandApprovalRequest {
  actionLabel: string;
  agent: string;
  riskLevel: CommandRiskLevel;
  /** Why the command got that rating, in plain words (shown in the approval window). */
  riskReasons?: string[];
  requireApproval?: boolean;
  /** A locked question (delete): asked even with Approval Mode off. */
  alwaysAsk?: boolean;
}

export type CommandApprovalHandler = (request: CommandApprovalRequest) => Promise<boolean>;

export type CommandApprovalOutcome = {
  approved: boolean;
  /** Commands that were subject to approval (empty when none needed it). */
  gated: PlannedCommand[];
  reason: 'not_required' | 'not_required_by_settings' | 'approved' | 'denied' | 'no_handler';
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

// ── Risk rating from what a command does (owner, 2026-10-22) ────────────────
// Every command used to be shown as "high, 85" whatever it did. The rating is
// now worked out from the command itself, with the reasons listed. This only
// decides whether to ASK: policy_gate.rs still decides what may run at all.

const VERSION_ARGS = new Set(['--version', '-v', '-V', 'version', '--help', '-h', 'help']);

/** Sub-commands that only read and print. */
const READ_ONLY_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'describe', 'blame', 'shortlog', 'remote']),
  npm: new Set(['audit', 'outdated', 'ls', 'list', 'view', 'config']),
  yarn: new Set(['audit', 'outdated', 'list', 'info']),
  pnpm: new Set(['audit', 'outdated', 'ls', 'list']),
  cargo: new Set(['audit', 'tree', 'metadata', 'search']),
  ollama: new Set(['list', 'ls', 'ps', 'show']),
  pip: new Set(['list', 'show', 'freeze', 'check']),
  pip3: new Set(['list', 'show', 'freeze', 'check']),
};

/** Programs that only inspect the computer. */
const READ_ONLY_PROGRAMS = new Set(['where', 'which', 'tasklist', 'ffprobe', 'whoami', 'hostname']);

/** Sub-commands that change files, packages, history or models. */
const CHANGING_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set(['add', 'commit', 'checkout', 'switch', 'reset', 'merge', 'rebase', 'pull', 'push', 'stash', 'tag', 'branch', 'restore', 'rm', 'mv', 'clean', 'cherry-pick', 'revert', 'fetch', 'clone', 'init', 'apply']),
  npm: new Set(['install', 'i', 'ci', 'uninstall', 'update', 'publish', 'link', 'prune', 'dedupe']),
  yarn: new Set(['add', 'remove', 'install', 'upgrade']),
  pnpm: new Set(['add', 'remove', 'install', 'update']),
  cargo: new Set(['update', 'clean', 'install', 'add', 'remove', 'fmt', 'fix']),
  ollama: new Set(['pull', 'rm', 'create', 'cp', 'push']),
  pip: new Set(['install', 'uninstall', 'download']),
  pip3: new Set(['install', 'uninstall', 'download']),
};

const NETWORK_SUBCOMMANDS: Record<string, Set<string>> = {
  git: new Set(['pull', 'push', 'fetch', 'clone']),
  npm: new Set(['install', 'i', 'ci', 'update', 'publish', 'audit', 'outdated', 'view']),
  yarn: new Set(['add', 'install', 'upgrade', 'audit', 'outdated', 'info']),
  pnpm: new Set(['add', 'install', 'update', 'audit', 'outdated']),
  cargo: new Set(['update', 'install', 'add', 'audit', 'search']),
  ollama: new Set(['pull', 'push']),
  pip: new Set(['install', 'download']),
  pip3: new Set(['install', 'download']),
};

export function deletesThings(prog: string, args: string[]): boolean {
  const a = args.map((x) => String(x).toLowerCase());
  const first = a[0] || '';
  if (prog === 'git') {
    return (first === 'reset' && a.includes('--hard')) || first === 'clean' || (first === 'push' && (a.includes('--force') || a.includes('-f')))
      || (first === 'branch' && a.includes('-d'));
  }
  if (prog === 'ollama') return first === 'rm';
  if (prog === 'cargo') return first === 'clean';
  return false;
}

export interface CommandRiskAssessment {
  level: CommandRiskLevel;
  /** Plain-language reasons for the rating. */
  reasons: string[];
  /** Only reads: runs without asking. */
  readOnly: boolean;
}

/** Rate a command from what it does. Unknown programs are rated high (fail closed). */
export function assessCommandRisk(program: string, args: string[] = []): CommandRiskAssessment {
  const prog = baseProgram(program);
  const list = Array.isArray(args) ? args.map(String) : [];
  const first = firstArg(list);

  if (!prog) return { level: 'high', reasons: ['No program was given.'], readOnly: false };

  if ((list.length === 1 && VERSION_ARGS.has(list[0])) || READ_ONLY_PROGRAMS.has(prog)) {
    return { level: 'low', reasons: ['Only reads information and prints it; it changes nothing.'], readOnly: true };
  }
  const readOnlySubs = READ_ONLY_SUBCOMMANDS[prog];
  if (readOnlySubs && readOnlySubs.has(first) && !(prog === 'git' && first === 'remote' && list.length > 1 && !['-v', 'show'].includes(list[1]))) {
    const reasons = ['Only reads information and prints it; it changes nothing.'];
    if (NETWORK_SUBCOMMANDS[prog]?.has(first)) reasons.push('Contacts the internet to look things up.');
    return { level: 'low', reasons, readOnly: true };
  }

  const known = prog in CHANGING_SUBCOMMANDS || ['node', 'npx', 'python', 'python3', 'pythonw', 'rustc', 'ffmpeg'].includes(prog);
  const reasons: string[] = [];
  let level: CommandRiskLevel = 'low';
  const raise = (to: CommandRiskLevel) => {
    const order = { low: 0, medium: 1, high: 2 };
    if (order[to] > order[level]) level = to;
  };

  if (!known) {
    reasons.push(`Alphonso does not know what "${prog}" does, so it is treated as risky.`);
    raise('high');
  }
  if (known && isWorkspaceCodeExecuting(program, list)) {
    reasons.push('Runs code from your project folder (package scripts, build scripts or tests), which could do anything that code does.');
    raise('high');
  }
  if (deletesThings(prog, list)) {
    reasons.push('Deletes or overwrites things that may not be recoverable.');
    raise('high');
  }
  if (CHANGING_SUBCOMMANDS[prog]?.has(first)) {
    reasons.push('Changes files, packages, history or models on this computer.');
    raise('medium');
  }
  if (NETWORK_SUBCOMMANDS[prog]?.has(first)) {
    reasons.push('Contacts the internet.');
    raise('medium');
  }
  if (prog === 'ffmpeg') {
    reasons.push('Writes a new media file.');
    raise('medium');
  }
  if (reasons.length === 0) {
    reasons.push('Its effect could not be worked out from the command, so it is not treated as read-only.');
    raise('medium');
  }
  return { level, reasons, readOnly: false };
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
  const valid = (commands || []).filter((c) => c && typeof c.program === 'string');
  const argsOf = (c: PlannedCommand) => (Array.isArray(c.args) ? c.args : []);
  const deleting = valid.filter((c) => deletesThings(baseProgram(c.program), argsOf(c)));
  const runsCode = valid.filter((c) => !deleting.includes(c) && isWorkspaceCodeExecuting(c.program, argsOf(c)));
  const askForRun = getEffectApprovals().run !== false;
  const gated = valid.filter((c) => deleting.includes(c) || (askForRun && runsCode.includes(c)));
  if (gated.length === 0) {
    return { approved: true, gated, reason: runsCode.length > 0 ? 'not_required_by_settings' : 'not_required' };
  }

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
    const ratings = gated.map((c) => assessCommandRisk(c.program, c.args || []));
    const riskLevel: CommandRiskLevel = ratings.some((r) => r.level === 'high') ? 'high' : ratings.some((r) => r.level === 'medium') ? 'medium' : 'low';
    const riskReasons = [...new Set(ratings.flatMap((r) => r.reasons))];
    approved = (await handler({ actionLabel, agent: 'alphonso', riskLevel, riskReasons, requireApproval: true, alwaysAsk: deleting.length > 0 })) === true;
  } catch {
    approved = false; // a failing approval UI must never read as consent
  }
  context.cache?.set(key, approved);
  return { approved, gated, reason: approved ? 'approved' : 'denied' };
}
