import { verifyCommandExecution } from './verificationService';

interface GitLogEntry {
  hash: string | undefined;
  subject: string | undefined;
  date: string | undefined;
}

interface GitStatusFile {
  status: string;
  path: string;
}

interface GitStatus {
  clean: boolean;
  output: string;
  files: GitStatusFile[];
}

interface GitCommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export async function getGitLog(projectDir: string | null, maxCount = 10): Promise<GitLogEntry[]> {
  if (!projectDir) return [];
  try {
    const result = await verifyCommandExecution('git', ['log', `--max-count=${maxCount}`, '--oneline', '--format=%H|%s|%ai'], projectDir);
    const payload = (result as { payload?: { stdout?: string } })?.payload || {};
    if (!payload.stdout) return [];
    return payload.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [hash, subject, date] = line.split('|');
      return { hash: hash?.trim(), subject: subject?.trim(), date: date?.trim() };
    });
  } catch {
    return [];
  }
}

export async function getGitStatus(projectDir: string | null): Promise<GitStatus | null> {
  if (!projectDir) return null;
  try {
    const result = await verifyCommandExecution('git', ['status', '--porcelain'], projectDir);
    const payload = (result as { payload?: { stdout?: string } })?.payload || {};
    return {
      clean: !payload.stdout?.trim(),
      output: payload.stdout || '',
      files: (payload.stdout || '').trim().split('\n').filter(Boolean).map((line) => ({
        status: line.slice(0, 2).trim(),
        path: line.slice(3).trim()
      }))
    };
  } catch {
    return null;
  }
}

export async function gitRevert(projectDir: string | null, commitHash: string | null): Promise<GitCommandResult> {
  if (!projectDir || !commitHash) return { success: false, output: '', error: 'Missing directory or commit hash' };
  try {
    const result = await verifyCommandExecution('git', ['revert', commitHash, '--no-edit'], projectDir);
    const payload = (result as { payload?: { success?: boolean; exitCode?: number; stdout?: string; stderr?: string } })?.payload || {};
    return {
      success: payload.success || payload.exitCode === 0,
      output: payload.stdout || payload.stderr || ''
    };
  } catch (e) {
    return { success: false, output: '', error: String((e as Error)?.message || e) };
  }
}

export async function gitRevertLast(projectDir: string | null): Promise<GitCommandResult> {
  if (!projectDir) return { success: false, output: '', error: 'Missing directory' };
  try {
    const result = await verifyCommandExecution('git', ['revert', 'HEAD', '--no-edit'], projectDir);
    const payload = (result as { payload?: { success?: boolean; exitCode?: number; stdout?: string; stderr?: string } })?.payload || {};
    return {
      success: payload.success || payload.exitCode === 0,
      output: payload.stdout || payload.stderr || ''
    };
  } catch (e) {
    return { success: false, output: '', error: String((e as Error)?.message || e) };
  }
}

export async function gitDiffStat(projectDir: string | null, fromHash?: string, toHash?: string): Promise<string | null> {
  if (!projectDir) return null;
  const args = ['diff', '--stat'];
  if (fromHash) args.push(fromHash);
  if (toHash) args.push(toHash);
  try {
    const result = await verifyCommandExecution('git', args, projectDir);
    const payload = (result as { payload?: { stdout?: string } })?.payload || {};
    return payload.stdout || '';
  } catch {
    return null;
  }
}
