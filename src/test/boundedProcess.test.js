import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// scripts/lib/bounded-process.ps1 is what keeps scripts/verify.ps1 from
// stalling on gitleaks. These tests run the real function in PowerShell,
// using pwsh itself as the stand-in process (sleep, fail, or not exist).

const LIB = path.resolve(__dirname, '../../scripts/lib/bounded-process.ps1');
const PWSH_AVAILABLE = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0;

function runBounded(childCommand, timeoutSeconds, filePath = null) {
  const target = filePath ? `'${filePath}'` : '(Get-Process -Id $PID).Path';
  const script = [
    `. '${LIB.replace(/'/g, "''")}'`,
    `$r = Invoke-BoundedProcess -FilePath ${target} -ArgumentList @('-NoProfile','-NonInteractive','-Command','${childCommand}') -TimeoutSeconds ${timeoutSeconds}`,
    '$r | ConvertTo-Json -Compress'
  ].join('; ');
  const started = Date.now();
  const out = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 25000 });
  if (out.status !== 0) throw new Error(`pwsh failed: ${out.stderr || out.stdout}`);
  return { result: JSON.parse(out.stdout.trim().split('\n').pop()), elapsedMs: Date.now() - started };
}

describe.skipIf(!PWSH_AVAILABLE)('Invoke-BoundedProcess (scripts/lib/bounded-process.ps1)', () => {
  it('stops a process that runs past the limit and reports a timeout', () => {
    const { result, elapsedMs } = runBounded('Start-Sleep -Seconds 20', 1);
    expect(result.Status).toBe('timeout');
    expect(result.ExitCode).toBeNull();
    expect(result.Message).toBe('exceeded 1s');
    // Far below the child's 20s sleep: the limit, not the child, ended it.
    expect(elapsedMs).toBeLessThan(15000);
  });

  it('reports a non-zero exit code from a process that finishes in time', () => {
    const { result } = runBounded('exit 3', 20);
    expect(result).toEqual({ Status: 'completed', ExitCode: 3, Message: null });
  });

  it('reports a clean exit', () => {
    const { result } = runBounded('exit 0', 20);
    expect(result).toEqual({ Status: 'completed', ExitCode: 0, Message: null });
  });

  it('reports an error when the executable cannot be started', () => {
    const { result } = runBounded('exit 0', 5, path.join(__dirname, 'no-such-gitleaks-binary.exe'));
    expect(result.Status).toBe('error');
    expect(result.ExitCode).toBeNull();
    expect(result.Message).toBeTruthy();
  });
});
