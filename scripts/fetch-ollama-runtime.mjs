// Dependency Bundling Plan (docs/DEPENDENCY_BUNDLING_PLAN.md), task O1/O2.
//
// Downloads the pinned Ollama release for the target platform, verifies its
// published sha256 checksum, and extracts it into src-tauri/vendor/ollama/ so
// tauri.conf.json's bundle.resources entry can stage it into the installer.
// Run this before `tauri build` (see .github/workflows/release.yml) — the
// Rust side (runtime_manager.rs's find_ollama()) checks for the extracted
// binary at runtime but never fetches it; that's this script's job.
//
// Pinned deliberately, not "latest" — bump OLLAMA_VERSION and the matching
// checksums together, after re-verifying both against a real release.

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', 'ollama');
const DOWNLOAD_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', '.download');

const OLLAMA_VERSION = 'v0.32.13';
const RELEASE_BASE = `https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}`;

// Verified 2026-08-16 against the real published sha256sum.txt for this tag —
// see docs/DEPENDENCY_BUNDLING_PLAN.md's O1/O2 evidence. Windows and Linux
// ship CUDA acceleration by default (~1.3-1.4GB); macOS is a universal
// binary (~150MB). This is the accepted-cost choice (Option 1: full GPU
// support, larger installer) — not the only option, see the plan doc.
const ASSETS = {
  'windows-amd64': {
    file: 'ollama-windows-amd64.zip',
    sha256: '20d61a8075038694f5b6db1e937551dbc79d470e85217003facf6ecaac394258',
    kind: 'zip'
  },
  'darwin-universal': {
    file: 'ollama-darwin.tgz',
    sha256: '71efd44f3b5f2019f42bae17ae58eb3de8bd25ce3ca3bc89aea58e53e5d091d1',
    kind: 'tar'
  },
  'linux-amd64': {
    file: 'ollama-linux-amd64.tar.zst',
    sha256: '0fd1dece38a1c6242e8013ce20b597345c5de072ae6b320160edb0e729ef1de1',
    kind: 'tar.zst'
  }
};

function resolvePlatformKey() {
  const override = process.argv[2] || process.env.OLLAMA_FETCH_PLATFORM;
  if (override) {
    if (!ASSETS[override]) {
      throw new Error(`Unknown platform key "${override}". Valid: ${Object.keys(ASSETS).join(', ')}`);
    }
    return override;
  }
  if (process.platform === 'win32') return 'windows-amd64';
  if (process.platform === 'darwin') return 'darwin-universal';
  if (process.platform === 'linux') return 'linux-amd64';
  throw new Error(`Unsupported platform "${process.platform}" — pass a platform key explicitly.`);
}

async function download(url, destPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  }
  await pipeline(response.body, createWriteStream(destPath));
}

async function sha256File(filePath) {
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function extract(archivePath, kind, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (kind === 'zip') {
    // Windows ships tar.exe (bsdtar/libarchive) since Win10 1803, which
    // extracts .zip directly. Verified 2026-08-16 for the real
    // ollama-windows-amd64.zip — but only via the `unzip` fallback below,
    // on a Linux sandbox whose GNU tar can't read zip at all; the primary
    // bsdtar path is expected to work on real Windows runners (that's what
    // GitHub's windows-latest images ship) but was not directly exercised
    // here. Re-verify against a real Windows CI run before trusting this
    // blindly. `unzip` is present via Git for Windows on windows-latest
    // runners if the primary path is ever unavailable.
    try {
      execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'inherit' });
    } catch {
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: 'inherit' });
    }
  } else if (kind === 'tar') {
    execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
  } else if (kind === 'tar.zst') {
    // Neither GNU tar's --zstd/-a nor bsdtar's built-in path decompress zstd
    // themselves — both shell out to a standalone `zstd` binary and fail
    // with "Cannot exec" if it isn't on PATH (verified 2026-08-16: this
    // sandbox's tar failed exactly this way until `zstd` was installed via
    // apt). The CI job running this must install the `zstd` package
    // explicitly — do not assume it ships by default.
    try {
      execFileSync('tar', ['--zstd', '-xf', archivePath, '-C', destDir], { stdio: 'inherit' });
    } catch {
      execFileSync('tar', ['-a', '-xf', archivePath, '-C', destDir], { stdio: 'inherit' });
    }
  } else {
    throw new Error(`Unknown archive kind: ${kind}`);
  }
}

// Verified 2026-08-16 against all three real v0.32.13 archives — the layout
// is NOT the same across platforms, so both branches below are load-bearing:
// - ollama-darwin.tgz is FLAT (ollama, llama-server, every backend
//   .dylib/.so sit directly at the archive root — no bin/lib split at all).
// - ollama-windows-amd64.zip and ollama-linux-amd64.tar.zst both DO have a
//   bin/ + lib/ split (bin/ollama[.exe], lib/ollama/*.dll or .so, including
//   cuda_v12/cuda_v13 subdirectories).
// The bin/lib layout matches the CI build's intermediate
// dist/<os>-<arch>/{bin,lib} directory; darwin's packaging step apparently
// flattens it before archiving. Don't assume either shape holds for a future
// release without checking — this was already wrong once before verifying.
async function normalizeLayout(extractedDir, vendorDir) {
  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(vendorDir, { recursive: true });

  const entries = await readdir(extractedDir);
  const hasFlatBinary = entries.includes('ollama') || entries.includes('ollama.exe');
  if (hasFlatBinary) {
    for (const name of entries) {
      await rename(join(extractedDir, name), join(vendorDir, name));
    }
    return;
  }
  // Fallback in case a future release reintroduces a bin/ + lib/ split.
  if (entries.includes('bin') || entries.includes('lib')) {
    if (entries.includes('bin')) {
      const binEntries = await readdir(join(extractedDir, 'bin'));
      for (const name of binEntries) {
        await rename(join(extractedDir, 'bin', name), join(vendorDir, name));
      }
    }
    if (entries.includes('lib')) {
      await rename(join(extractedDir, 'lib'), join(vendorDir, 'lib'));
    }
    return;
  }
  // Single top-level wrapper directory — recurse one level.
  if (entries.length === 1) {
    return normalizeLayout(join(extractedDir, entries[0]), vendorDir);
  }
  throw new Error(
    `Unexpected archive layout in ${extractedDir}: [${entries.join(', ')}]. ` +
    'Update normalizeLayout() to match — do not assume the old layout still holds.'
  );
}

async function main() {
  const platformKey = resolvePlatformKey();
  const asset = ASSETS[platformKey];
  const url = `${RELEASE_BASE}/${asset.file}`;

  rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const archivePath = join(DOWNLOAD_DIR, asset.file);
  const extractedPath = join(DOWNLOAD_DIR, 'extracted');

  process.stdout.write(`[fetch-ollama-runtime] platform=${platformKey} version=${OLLAMA_VERSION}\n`);
  process.stdout.write(`[fetch-ollama-runtime] downloading ${url}\n`);
  await download(url, archivePath);

  const actualSha256 = await sha256File(archivePath);
  if (actualSha256 !== asset.sha256) {
    throw new Error(
      `Checksum mismatch for ${asset.file}: expected ${asset.sha256}, got ${actualSha256}. ` +
      'Refusing to stage an unverified binary — do not bypass this check.'
    );
  }
  process.stdout.write(`[fetch-ollama-runtime] checksum verified: ${actualSha256}\n`);

  process.stdout.write(`[fetch-ollama-runtime] extracting to ${extractedPath}\n`);
  extract(archivePath, asset.kind, extractedPath);

  await normalizeLayout(extractedPath, VENDOR_DIR);
  await rm(DOWNLOAD_DIR, { recursive: true, force: true });

  const staged = await readdir(VENDOR_DIR);
  process.stdout.write(`[fetch-ollama-runtime] staged into ${VENDOR_DIR}: [${staged.join(', ')}]\n`);
  if (!existsSync(join(VENDOR_DIR, 'ollama')) && !existsSync(join(VENDOR_DIR, 'ollama.exe'))) {
    throw new Error(`Expected ollama/ollama.exe at the root of ${VENDOR_DIR} after staging — not found.`);
  }
  process.stdout.write('[fetch-ollama-runtime] done.\n');
}

main().catch((error) => {
  process.stderr.write(`[fetch-ollama-runtime] Failed: ${String(error?.stack || error)}\n`);
  process.exit(1);
});
