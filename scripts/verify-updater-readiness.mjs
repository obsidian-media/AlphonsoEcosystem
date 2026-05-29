import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const RC0_DIR = join(PROJECT_ROOT, 'release', 'rc0');
const TAURI_CONFIG_PATH = join(PROJECT_ROOT, 'src-tauri', 'tauri.conf.json');
const INSTALLER_PATH = join(PROJECT_ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis', 'Alphonso_0.1.0_x64-setup.exe');
const SIGNATURE_PATH = `${INSTALLER_PATH}.sig`;
const LATEST_JSON_PATH = join(PROJECT_ROOT, 'release', 'updater', 'windows-x86_64', 'latest.json');

function stateFromBoolean(value) {
  return value ? 'ready' : 'setup_required';
}

function safeBool(value) {
  return Boolean(value && String(value).trim());
}

function inspectSigningEnv(name) {
  const value = process.env[name];
  if (!safeBool(value)) {
    return { name, state: 'missing', present: false, pathExists: false, kind: 'missing' };
  }

  const trimmed = String(value).trim();
  const pathLike = trimmed.includes('\\') || trimmed.includes('/') || trimmed.endsWith('.key');
  const pathExists = pathLike ? existsSync(trimmed) : false;
  return {
    name,
    state: pathExists ? 'ready' : 'setup_required',
    present: true,
    pathExists,
    kind: pathLike ? 'path' : 'inline'
  };
}

function inspectFile(filePath) {
  return {
    path: filePath,
    present: existsSync(filePath),
    state: stateFromBoolean(existsSync(filePath))
  };
}

function inspectUpdaterConfig() {
  try {
    const config = JSON.parse(readFileSync(TAURI_CONFIG_PATH, 'utf8'));
    const pubkey = config?.plugins?.updater?.pubkey;
    return {
      configured: safeBool(pubkey),
      state: safeBool(pubkey) ? 'ready' : 'setup_required',
      pubkeyConfigured: safeBool(pubkey)
    };
  } catch (error) {
    return {
      configured: false,
      state: 'failed',
      pubkeyConfigured: false,
      error: String(error)
    };
  }
}

function inspectBaseUrl() {
  const value = String(process.env.ALPHONSO_UPDATE_BASE_URL || '').trim();
  if (!value) {
    return { present: false, valid: false, state: 'missing' };
  }
  try {
    const parsed = new URL(value);
    return {
      present: true,
      valid: parsed.protocol === 'https:' || parsed.protocol === 'http:',
      state: parsed.protocol === 'https:' || parsed.protocol === 'http:' ? 'ready' : 'invalid'
    };
  } catch {
    return { present: true, valid: false, state: 'invalid' };
  }
}

async function main() {
  mkdirSync(RC0_DIR, { recursive: true });

  const signing = {
    TAURI_SIGNING_PRIVATE_KEY: inspectSigningEnv('TAURI_SIGNING_PRIVATE_KEY'),
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: inspectSigningEnv('TAURI_SIGNING_PRIVATE_KEY_PASSWORD')
  };
  const baseUrl = inspectBaseUrl();
  const files = {
    installer: inspectFile(INSTALLER_PATH),
    signature: inspectFile(SIGNATURE_PATH),
    latestJson: inspectFile(LATEST_JSON_PATH)
  };
  const updaterConfig = inspectUpdaterConfig();

  const report = {
    runtime: 'local_shell',
    timestamp: new Date().toISOString(),
    signing,
    baseUrl,
    updaterConfig,
    files,
    overallState:
      !signing.TAURI_SIGNING_PRIVATE_KEY.present || !baseUrl.valid
        ? 'setup_required'
        : !files.installer.present || !files.signature.present || !files.latestJson.present || !updaterConfig.configured
          ? 'blocked'
          : 'ready',
    setupRequiredReason: !signing.TAURI_SIGNING_PRIVATE_KEY.present
      ? 'TAURI_SIGNING_PRIVATE_KEY is missing.'
      : !baseUrl.valid
        ? 'ALPHONSO_UPDATE_BASE_URL is missing or invalid.'
        : null,
    missing: {
      signing: Object.entries(signing)
        .filter(([name, entry]) => name !== 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD' && entry.state !== 'ready')
        .map(([name]) => name),
      optionalSigning: signing.TAURI_SIGNING_PRIVATE_KEY_PASSWORD.state !== 'ready' ? ['TAURI_SIGNING_PRIVATE_KEY_PASSWORD'] : [],
      updater: [
        !files.installer.present ? 'installer' : null,
        !files.signature.present ? 'signature' : null,
        !files.latestJson.present ? 'latest.json' : null,
        !updaterConfig.configured ? 'pubkey' : null,
        !baseUrl.valid ? 'base_url' : null
      ].filter(Boolean)
    }
  };

  const outputPath = join(RC0_DIR, 'updater-readiness.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ outputPath, report }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[updater-verify] Failed: ${String(error)}\n`);
  process.exit(1);
});
