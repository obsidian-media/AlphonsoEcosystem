import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkDesktopPreflight } from './verify-desktop-preflight.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PROJECT_ROOT = process.cwd();
const NSIS_INSTALLER_PATH = join(
  PROJECT_ROOT,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'nsis',
  'Alphonso_0.1.0_x64-setup.exe'
);
const MSI_INSTALLER_PATH = join(
  PROJECT_ROOT,
  'src-tauri',
  'target',
  'release',
  'bundle',
  'msi',
  'Alphonso_0.1.0_x64_en-US.msi'
);

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';

function run(command, args) {
  return new Promise((resolve) => {
    const child = isWindows
      ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        })
      : spawn(command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        });

    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

function normalizeBuildResult(result) {
  if (result.code === 0) return result;
  if (isExpectedUpdaterKeyError(result.output) && hasBundles()) {
    return { ...result, code: 0, setupRequiredUpdater: true };
  }
  return result;
}

function hasBundles() {
  return existsSync(NSIS_INSTALLER_PATH) && existsSync(MSI_INSTALLER_PATH);
}

function isExpectedUpdaterKeyError(output) {
  const text = String(output || '');
  return text.includes('A public key has been found, but no private key')
    || text.includes('TAURI_SIGNING_PRIVATE_KEY');
}

async function main() {
  const preflight = checkDesktopPreflight();
  if (!preflight.ok) {
    process.stderr.write(`[alphonso] verify:desktop preflight blocked: WiX 3.14 is setup_required on this machine. ${preflight.hardPrecondition}\n`);
    process.exit(2);
  }

  const verifyApp = await run(npmCommand, ['run', 'verify:app']);
  if (verifyApp.code !== 0) {
    process.exit(verifyApp.code);
  }

  const firstBuild = normalizeBuildResult(await run(npxCommand, ['tauri', 'build']));
  if (firstBuild.code !== 0) {
    process.exit(firstBuild.code);
  }

  const hasOs32Warning = firstBuild.output.includes('os error 32');
  if (!hasOs32Warning) {
    process.exit(0);
  }

  process.stdout.write('\n[alphonso] Detected file lock warning (os error 32). Retrying tauri build once after cooldown...\n');
  await sleep(3000);

  const secondBuild = normalizeBuildResult(await run(npxCommand, ['tauri', 'build']));
  if (secondBuild.code !== 0) {
    process.exit(secondBuild.code);
  }

  const stillLocked = secondBuild.output.includes('os error 32');
  if (stillLocked) {
    process.stderr.write('\n[alphonso] Build completed but updater patch warning persists (os error 32). Close running Alphonso processes and retry for updater-safe metadata.\n');
    process.exit(2);
  }

  if (firstBuild.setupRequiredUpdater || secondBuild.setupRequiredUpdater) {
    process.stdout.write('\n[alphonso] Desktop bundles were produced; updater signing is still setup-required.\n');
  }
}

main().catch((error) => {
  process.stderr.write(`[alphonso] verify-desktop failed: ${String(error)}\n`);
  process.exit(1);
});
