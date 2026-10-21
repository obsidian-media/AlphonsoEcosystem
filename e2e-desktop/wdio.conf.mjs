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
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Not tauri-driver's default 4444: that is the Alphonso Bridge port.
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

  async beforeSession() {
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
      env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profileDir, ALPHONSO_E2E_PROFILE: dataProfile },
    });
    // The session is created right after this hook returns. Without waiting,
    // the first spec could connect before tauri-driver was listening and fail
    // with "Unable to connect to 127.0.0.1:4455" (QA Bug 22, 2026-10-21).
    await waitForPort(4455, 30000, tauriDriver);
  },

  async afterSession() {
    // Wait for the driver to exit, so the next spec's driver can bind 4455.
    await stopProcess(tauriDriver);
    try {
      for (const dir of testDataDirs(dataProfile)) rmSync(dir, { recursive: true, force: true });
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // WebView2 can hold the profile open briefly after exit; a leftover
      // temp directory is harmless.
    }
  },
};
