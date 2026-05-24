import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const TAURI_DIR = join(PROJECT_ROOT, 'src-tauri');
const TAURI_CONFIG_PATH = join(TAURI_DIR, 'tauri.conf.json');
const KEY_DIR = join(PROJECT_ROOT, '.tauri');
const PRIVATE_KEY_PATH = join(KEY_DIR, 'alphonso-updater.key');
const PUBLIC_KEY_PATH = `${PRIVATE_KEY_PATH}.pub`;

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      shell: false,
      stdio: 'inherit'
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeKey(key) {
  return key
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

async function ensureKeys({ force = false }) {
  mkdirSync(KEY_DIR, { recursive: true });
  if (!force && existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    process.stdout.write(`[updater-setup] Existing keypair found at ${PRIVATE_KEY_PATH}\n`);
    return;
  }

  const args = [
    'tauri',
    'signer',
    'generate',
    '--write-keys',
    PRIVATE_KEY_PATH,
    '--ci'
  ];
  const password = String(process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '').trim();
  if (password) {
    args.splice(4, 0, '--password', password);
  }
  if (force) {
    args.push('--force');
  }

  process.stdout.write('[updater-setup] Generating updater signing keys...\n');
  const code = await run('npx.cmd', args);
  if (code !== 0) {
    throw new Error(`Key generation failed with exit code ${code}.`);
  }
}

function updateTauriConfigPubkey(pubkey) {
  const config = readJson(TAURI_CONFIG_PATH);
  const next = {
    ...config,
    plugins: {
      ...(config.plugins || {}),
      updater: {
        ...((config.plugins || {}).updater || {}),
        pubkey
      }
    }
  };
  writeJson(TAURI_CONFIG_PATH, next);
}

async function main() {
  const force = process.argv.includes('--force');
  const generateOnly = process.argv.includes('--generate-only');

  await ensureKeys({ force });
  if (!existsSync(PUBLIC_KEY_PATH)) {
    throw new Error(`Public key file was not found at ${PUBLIC_KEY_PATH}`);
  }

  const pubkey = normalizeKey(readFileSync(PUBLIC_KEY_PATH, 'utf8'));
  if (!pubkey) {
    throw new Error('Public key file is empty.');
  }

  if (!generateOnly) {
    updateTauriConfigPubkey(pubkey);
    process.stdout.write('[updater-setup] Updated src-tauri/tauri.conf.json plugins.updater.pubkey\n');
  }

  process.stdout.write('\n[updater-setup] Next environment variables for signed release build:\n');
  process.stdout.write(`$env:TAURI_SIGNING_PRIVATE_KEY="${PRIVATE_KEY_PATH}"\n`);
  process.stdout.write('$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""\n');
  process.stdout.write('$env:ALPHONSO_UPDATE_BASE_URL="https://releases.example.com/alphonso/windows"\n');
}

main().catch((error) => {
  process.stderr.write(`[updater-setup] Failed: ${String(error)}\n`);
  process.exit(1);
});
