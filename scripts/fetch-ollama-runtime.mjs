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
//
// CUDA variant trim (2026-08-21, installer-size fix): Windows/Linux ship BOTH
// cuda_v12 (~1.1GB uncompressed) and cuda_v13 (~630MB uncompressed) backend
// directories under lib/ollama/ — shipping both pushed the Windows NSIS
// installer past a data-block size makensis chokes on ("error mmapping
// datablock"), breaking every Windows/Linux desktop build since 2026-08-16
// (docs/governance/DEFERRED_WORK.md). Real measured sizes verified 2026-08-21
// by actually extracting the v0.32.13 windows-amd64 archive, not estimated.
// Dropping cuda_v13 and keeping cuda_v12 is the deliberate choice: NVIDIA
// drivers are backward-compatible (a driver new enough for v13 also runs v12
// binaries), so keeping v12 preserves GPU acceleration for the widest driver
// range at the larger of the two footprints; keeping only v13 would save more
// space but silently drop CUDA support for anyone without the newest driver.
// macOS has no cuda_v* directories at all (Apple GPU path is separate), so
// this only ever applies to windows-amd64/linux-amd64 — the prune step below
// is a no-op if the directory isn't present, so it doesn't need a platform
// check of its own.
const CUDA_VARIANT_TO_DROP = 'cuda_v13';

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
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
  // Streamed, not buffered — these archives run ~1.4GB on Windows/Linux;
  // readFile()'ing the whole thing into memory before hashing was needless
  // peak-memory pressure in CI for no benefit over hashing as it streams.
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
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

// Real path verified 2026-08-21 by actually extracting the windows-amd64
// v0.32.13 archive: lib/ollama/cuda_v12 and lib/ollama/cuda_v13, sitting
// alongside the CPU-only ggml-cpu-*.dll variants and a small vulkan/
// fallback dir. No-op (not an error) if the path doesn't exist — covers
// macOS, which never had cuda_v* dirs, and any future release layout change
// without needing a separate platform branch here.
async function pruneCudaVariant(vendorDir, variant) {
  const cudaDir = join(vendorDir, 'lib', 'ollama', variant);
  if (!existsSync(cudaDir)) {
    process.stdout.write(`[fetch-ollama-runtime] no ${variant} directory to prune (${cudaDir}) — skipping\n`);
    return;
  }
  await rm(cudaDir, { recursive: true, force: true });
  process.stdout.write(`[fetch-ollama-runtime] pruned ${cudaDir} (installer-size fix — see the CUDA variant trim note near OLLAMA_VERSION)\n`);
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
  await pruneCudaVariant(VENDOR_DIR, CUDA_VARIANT_TO_DROP);
  // Linux-only, additional to the cuda_v13 drop above: linuxdeploy (the
  // AppImage bundler) failed every Linux desktop build since 2026-08-27
  // with "ERROR: Could not find dependency: libggml-base.so.0" — confirmed
  // via `tauri build --verbose` (not the default; had been hiding this
  // exact error behind a generic "failed to run linuxdeploy" for months).
  // Root cause: any lib/ollama/<subdir>/*.so backend (cuda_v12, then after
  // pruning that, vulkan/ — discovered one CI run at a time as each was
  // pruned and the *next* subdirectory hit the same wall) references
  // libggml-base.so.0 via an RPATH that points to its own directory, not
  // the parent lib/ollama/ where that library actually lives — a
  // resolution limit in linuxdeploy's dependency walker, not something
  // fixable by installing a missing tool. Rather than prune subdirectories
  // by name one at a time as each is discovered, prune every subdirectory
  // under lib/ollama/ generically — covers whatever ships today (cuda_v12,
  // vulkan) and any future GPU backend directory a later Ollama release
  // adds, without needing another round of "which one broke it this time".
  // Windows keeps every backend (already proven working there — see the
  // note above). Linux users temporarily lose bundled GPU acceleration
  // (CUDA and Vulkan) in the AppImage; CPU-only Ollama inference is
  // unaffected. Revisit if linuxdeploy adds a way to skip strict dependency
  // resolution for specific files, or if patchelf-ing every backend .so's
  // RPATH to add $ORIGIN/.. proves reliable across CI runs.
  if (platformKey === 'linux-amd64') {
    const ollamaLibDir = join(VENDOR_DIR, 'lib', 'ollama');
    const libEntries = existsSync(ollamaLibDir)
      ? await readdir(ollamaLibDir, { withFileTypes: true })
      : [];
    for (const entry of libEntries) {
      if (entry.isDirectory()) {
        await pruneCudaVariant(VENDOR_DIR, entry.name);
      }
    }
  }
  await rm(DOWNLOAD_DIR, { recursive: true, force: true });

  // normalizeLayout() wipes VENDOR_DIR before repopulating it, which also
  // deletes the git-tracked .gitkeep placeholder from the working tree.
  // Re-touch it so a contributor who fetches locally doesn't see it as
  // locally deleted (and risk committing that deletion via `git add -A`,
  // breaking `cargo check` again for everyone else — see the Implementation
  // log in docs/DEPENDENCY_BUNDLING_PLAN.md for why that file must survive).
  await writeFile(
    join(VENDOR_DIR, '.gitkeep'),
    'Re-created by scripts/fetch-ollama-runtime.mjs after fetching — see the ' +
    'tracked version of this file in git for the full explanation of why it ' +
    'must exist.\n',
    'utf8'
  );

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
