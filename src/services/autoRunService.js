import { verifyCommandExecution } from './verificationService';

const AUTO_RUN_KEY = 'alphonso_auto_run_v1';

export function getAutoRunEnabled() {
  try {
    return localStorage.getItem(AUTO_RUN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAutoRunEnabled(enabled) {
  try {
    localStorage.setItem(AUTO_RUN_KEY, String(enabled));
  } catch { /* quota */ }
}

export async function autoRunDevServer(projectDir) {
  if (!projectDir || !getAutoRunEnabled()) return null;
  try {
    const result = await verifyCommandExecution('npm', ['run', 'dev'], projectDir);
    const payload = result?.payload || {};
    return {
      success: payload.success || payload.exitCode === 0,
      output: payload.stdout || payload.stderr || '',
      url: extractDevUrl(payload.stdout || '')
    };
  } catch {
    return null;
  }
}

function extractDevUrl(output) {
  const match = String(output).match(/https?:\/\/localhost:\d+/);
  return match ? match[0] : null;
}
