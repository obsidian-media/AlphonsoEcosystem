import { verifyCommandExecution } from './verificationService';

export async function getGitLog(projectDir, maxCount = 10) {
  if (!projectDir) return [];
  try {
    const result = await verifyCommandExecution('git', ['log', `--max-count=${maxCount}`, '--oneline', '--format=%H|%s|%ai'], projectDir);
    const payload = result?.payload || {};
    if (!payload.stdout) return [];
    return payload.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [hash, subject, date] = line.split('|');
      return { hash: hash?.trim(), subject: subject?.trim(), date: date?.trim() };
    });
  } catch {
    return [];
  }
}

export async function getGitStatus(projectDir) {
  if (!projectDir) return null;
  try {
    const result = await verifyCommandExecution('git', ['status', '--porcelain'], projectDir);
    const payload = result?.payload || {};
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

export async function gitRevert(projectDir, commitHash) {
  if (!projectDir || !commitHash) return { success: false, error: 'Missing directory or commit hash' };
  try {
    const result = await verifyCommandExecution('git', ['revert', commitHash, '--no-edit'], projectDir);
    const payload = result?.payload || {};
    return {
      success: payload.success || payload.exitCode === 0,
      output: payload.stdout || payload.stderr || ''
    };
  } catch (e) {
    return { success: false, error: String(e?.message || e) };
  }
}

export async function gitRevertLast(projectDir) {
  if (!projectDir) return { success: false, error: 'Missing directory' };
  try {
    const result = await verifyCommandExecution('git', ['revert', 'HEAD', '--no-edit'], projectDir);
    const payload = result?.payload || {};
    return {
      success: payload.success || payload.exitCode === 0,
      output: payload.stdout || payload.stderr || ''
    };
  } catch (e) {
    return { success: false, error: String(e?.message || e) };
  }
}

export async function gitDiffStat(projectDir, fromHash, toHash) {
  if (!projectDir) return null;
  const args = ['diff', '--stat'];
  if (fromHash) args.push(fromHash);
  if (toHash) args.push(toHash);
  try {
    const result = await verifyCommandExecution('git', args, projectDir);
    const payload = result?.payload || {};
    return payload.stdout || '';
  } catch {
    return null;
  }
}
