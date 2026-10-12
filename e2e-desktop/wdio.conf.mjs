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

  beforeSession() {
    // A throwaway WebView2 profile per run: tests start from a clean
    // localStorage and never read or write the developer's real app profile.
    // (The Rust side still uses the real app-data directory, so specs must
    // not write durable state there without cleaning up.)
    profileDir = mkdtempSync(join(tmpdir(), 'alphonso-e2e-profile-'));
    const args = ['--port', '4455', '--native-port', '4456'];
    if (process.env.ALPHONSO_E2E_EDGEDRIVER) {
      args.push('--native-driver', process.env.ALPHONSO_E2E_EDGEDRIVER);
    }
    tauriDriver = spawn(tauriDriverBinary, args, {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profileDir },
    });
  },

  afterSession() {
    tauriDriver?.kill();
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // WebView2 can hold the profile open briefly after exit; a leftover
      // temp directory is harmless.
    }
  },
};
