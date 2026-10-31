// Desktop end-to-end tests: drives the REAL Tauri binary (real Rust backend,
// real WebView2 window) through tauri-driver. This is separate from `e2e/`,
// which runs Playwright against the Vite web build with the Tauri bridge
// mocked (e2e/tauri-mock.js) and therefore never exercises the backend.
//
// Prerequisites (Windows / Linux only; tauri-driver has no macOS support):
//   cargo install tauri-driver --locked --version "^2"
//   Windows: msedgedriver matching the installed WebView2 runtime version,
//            on PATH or pointed to by ALPHONSO_E2E_EDGEDRIVER
//   npm run tauri build -- --debug --no-bundle
//
// Run: npm run test:e2e:desktop
import { execFileSync, spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERMES_HOME_FOR_TEST } from './fixtures/hermesHome.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const isWindows = process.platform === 'win32';
const exe = isWindows ? '.exe' : '';

const appBinary =
  process.env.ALPHONSO_E2E_APP ||
  resolve(here, '..', 'src-tauri', 'target', 'debug', `app${exe}`);
const tauriDriverBinary =
  process.env.ALPHONSO_E2E_TAURI_DRIVER ||
  join(homedir(), '.cargo', 'bin', `tauri-driver${exe}`);

let tauriDriver;
let profileDir;
let dataProfile;

/** Folders the backend creates for an isolated test profile (see
 *  `e2e_profile()` in src-tauri/src/utils.rs). Removed after each session. */
function testDataDirs(profile) {
  const identifier = `com.shayan.alphonso.e2e.${profile}`;
  const roots = [process.env.APPDATA, process.env.LOCALAPPDATA, process.env.XDG_DATA_HOME, process.env.XDG_CONFIG_HOME]
    .filter(Boolean);
  return [
    ...roots.map((root) => join(root, identifier)),
    ...(process.env.APPDATA ? [join(process.env.APPDATA, `Alphonso-e2e-${profile}`)] : []),
  ];
}

/** Removes this run's keychain entries (QA batch 1, 2026-10-28): a test profile's keys sit under a
 *  service ending in `.e2e.<profile>` (`service_name()` in os_keychain_store.rs), and nothing ever
 *  deleted them, so every run left one in Windows Credential Manager; a live run would have left real
 *  keys. Only entries ending with this run's own profile id are touched. Windows only (CI's Linux
 *  runners are thrown away after each run). */
export function removeTestKeychain(profile) {
  if (process.platform !== 'win32' || !profile) return [];
  let listed = '';
  try {
    listed = execFileSync('cmdkey', ['/list'], { encoding: 'utf8', windowsHide: true });
  } catch {
    return [];
  }
  const targets = [...listed.matchAll(/Target:\s*(?:LegacyGeneric:target=)?(\S+)/g)].map((m) => m[1])
    .filter((t) => t.endsWith(`.e2e.${profile}`));
  for (const target of targets) {
    try { execFileSync('cmdkey', [`/delete:${target}`], { stdio: 'ignore', windowsHide: true }); } catch { /* already gone */ }
  }
  return targets;
}

// The app under test must never see a real credential. The WebdriverIO CLI
// loads the repo's .env (`import "dotenv/config"`) and this config passed its
// whole environment on, so the test app saw the developer's real GitHub and
// Slack tokens and their user-level NVIDIA/Gemini/DashScope keys (QA Bug 37,
// 2026-10-21). Anything named like a secret is dropped.
const SECRET_ENV_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|_KEY|_SID|CREDENTIALS?)$/i;
export function testAppEnv(extra = {}) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!SECRET_ENV_NAME.test(name)) env[name] = value;
  }
  return { ...env, ...extra };
}

/** Resolve once something accepts TCP connections on 127.0.0.1:port. */
async function waitForPort(port, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`tauri-driver exited (code ${child.exitCode}) before listening on port ${port}`);
    }
    const open = await new Promise((resolveOpen) => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolveOpen(true); });
      socket.once('error', () => { socket.destroy(); resolveOpen(false); });
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`tauri-driver did not start listening on port ${port} within ${timeoutMs} ms`);
}

/** Stop a child process and wait until it has really exited. */
async function stopProcess(child, timeoutMs = 10000) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill();
  await Promise.race([exited, new Promise((r) => setTimeout(r, timeoutMs))]);
}

export const config = {
  runner: 'local',
  hostname: '127.0.0.1',
  // Not tauri-driver's default 4444, so a tool a user runs on that port can't clash.
  port: 4455,
  specs: [resolve(here, 'specs', '**', '*.e2e.mjs')],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': { application: appBinary },
    },
  ],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 20000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 1,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180000 },

  onPrepare() {
    if (!existsSync(appBinary)) {
      throw new Error(
        `Desktop binary not found at ${appBinary}. Build it first: npm run tauri build -- --debug --no-bundle`
      );
    }
    if (!existsSync(tauriDriverBinary)) {
      throw new Error(
        `tauri-driver not found at ${tauriDriverBinary}. Install it: cargo install tauri-driver --locked --version "^2"`
      );
    }
  },

  async beforeSession(_config, _capabilities, specs = []) {
    // Each spec file gets a throwaway WebView2 profile (clean localStorage)
    // AND an isolated backend profile: ALPHONSO_E2E_PROFILE makes a debug
    // build keep its SQLite store, config, runtimes folder and keychain
    // entries apart from the developer's real ones. Without it the app loads
    // real chat history and settings, and anything a spec sends or saves
    // lands in the developer's real data.
    profileDir = mkdtempSync(join(tmpdir(), 'alphonso-e2e-profile-'));
    dataProfile = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    process.env.ALPHONSO_E2E_PROFILE = dataProfile;
    const args = ['--port', '4455', '--native-port', '4456'];
    if (process.env.ALPHONSO_E2E_EDGEDRIVER) {
      args.push('--native-driver', process.env.ALPHONSO_E2E_EDGEDRIVER);
    }
    tauriDriver = spawn(tauriDriverBinary, args, {
      stdio: [null, process.stdout, process.stderr],
      env: testAppEnv({
        WEBVIEW2_USER_DATA_FOLDER: profileDir,
        ALPHONSO_E2E_PROFILE: dataProfile,
        // Outside tools (2026-10-30): only the MCP spec may use a local http stand-in server; a debug
        // build under a test profile honours it, a release build never does.
        ...(specs.some((s) => /mcp\.e2e\.mjs$/.test(String(s))) ? { ALPHONSO_E2E_MCP_LOCAL: '1' } : {}),
        // The Hermes spec finds a test Hermes folder, never a real one (Hermes gateway, 2026-10-30).
        ...(specs.some((s) => /hermes\.e2e\.mjs$/.test(String(s))) ? { HERMES_HOME: HERMES_HOME_FOR_TEST } : {}),
      }),
    });
    // The session is created right after this hook returns. Without waiting,
    // the first spec could connect before tauri-driver was listening and fail
    // with "Unable to connect to 127.0.0.1:4455" (QA Bug 22, 2026-10-21).
    await waitForPort(4455, 30000, tauriDriver);
  },

  async afterSession() {
    // Wait for the driver to exit, so the next spec's driver can bind 4455.
    await stopProcess(tauriDriver);
    removeTestKeychain(dataProfile);
    try {
      for (const dir of testDataDirs(dataProfile)) rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // WebView2 can hold the profile open briefly after exit; a leftover
      // temp directory is harmless.
    }
  },
};
