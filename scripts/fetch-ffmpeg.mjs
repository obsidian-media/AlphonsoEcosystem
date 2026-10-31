// Miya content factory phase 2a (owner, 2026-10-23): ffmpeg is bundled in the
// Windows installer, so assembly, captions and checks work right after install.
// Since the closing phase (owner, 2026-10-30) the Linux AppImage bundles it too
// (`node scripts/fetch-ffmpeg.mjs linux`); macOS users install it with Homebrew.
//
// An LGPL build only (most ready-made builds are GPL, which brings stricter
// terms when redistributed), the shared variant (ffmpeg and ffprobe share
// their libraries, which keeps the installer under its size ceiling next to
// the bundled Ollama), pinned to a dated release-branch build and checked
// against the SHA-256 GitHub records for that asset.
//
// Downloads into src-tauri/vendor/ffmpeg/, which tauri.conf.json stages into
// the installer as "ffmpeg". Run before `tauri build` (ci.yml, release.yml).
// The Linux build keeps its bin/ and lib/ folders: its programs load their
// libraries from $ORIGIN/../lib (checked in the binary's RPATH, 2026-10-30).
// Bump the URL and checksum together, from `gh api repos/BtbN/FFmpeg-Builds/
// releases/tags/<tag> --jq '.assets[] | .name + " " + .digest'`.
import { createHash } from 'node:crypto';
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', 'ffmpeg');
const DOWNLOAD_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', '.download');

// Both from one release, so Windows and Linux run the same ffmpeg.
export const FFMPEG_ASSETS = {
  windows: {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-22-13-06/ffmpeg-n8.1.3-23-g5c4f5744cd-win64-lgpl-shared-8.1.zip',
    sha256: 'c41df73a3f3259e81d5d53e6ce0c4c80b4841a30894fb77954650e445daa6c53',
  },
  linux: {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-22-13-06/ffmpeg-n8.1.3-23-g5c4f5744cd-linux64-lgpl-shared-8.1.tar.xz',
    sha256: '97fa301cf2bbc0609f0879a3db4440a9829585dd14d3bfcf9d5d2080cc180705',
  },
};
export const FFMPEG_ASSET = FFMPEG_ASSETS.windows;

/** `windows` (the default) or `linux`, from the command line. */
export function platformArg(args) {
  const value = args[0] || 'windows';
  if (value !== 'windows' && value !== 'linux') throw new Error(`[fetch-ffmpeg] platform must be windows or linux, not ${value}`);
  return value;
}

/**
 * Linux: which archive entries are bundled, and where (null = left out). The programs,
 * the license, and each library under the versioned name the programs ask for
 * (`libavcodec.so.62`); the unversioned and full-version names are links to the same file.
 */
export function KEEP_FILE_LINUX(entryPath) {
  const parts = entryPath.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1];
  const folder = parts[parts.length - 2] || '';
  if (name === 'LICENSE.txt' && parts.length <= 2) return name;
  if (folder === 'bin' && (name === 'ffmpeg' || name === 'ffprobe')) return `bin/${name}`;
  if (folder === 'lib' && /^lib[a-z0-9_]+\.so\.\d+$/.test(name)) return `lib/${name}`;
  return null;
}

/** Which archive entries are bundled, by their file name (null = left out). */
export function KEEP_FILE(entryPath) {
  const parts = entryPath.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1];
  const folder = parts[parts.length - 2] || '';
  if (name === 'LICENSE.txt' && parts.length <= 2) return name;
  if (folder !== 'bin') return null;
  if (name === 'ffmpeg.exe' || name === 'ffprobe.exe') return name;
  if (/\.dll$/i.test(name)) return name;
  return null;
}

const STAMP = join(VENDOR_DIR, '.version');

async function download(url, destPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  await pipeline(response.body, createWriteStream(destPath));
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

async function main() {
  const platform = platformArg(process.argv.slice(2));
  const asset = FFMPEG_ASSETS[platform];
  const keep = platform === 'linux' ? KEEP_FILE_LINUX : KEEP_FILE;
  const programs = platform === 'linux' ? ['bin/ffmpeg', 'bin/ffprobe'] : ['ffmpeg.exe', 'ffprobe.exe'];
  if (existsSync(STAMP) && readFileSync(STAMP, 'utf8').trim() === asset.sha256 && existsSync(join(VENDOR_DIR, programs[0]))) {
    console.log('[fetch-ffmpeg] already present');
    return;
  }
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const archive = join(DOWNLOAD_DIR, platform === 'linux' ? 'ffmpeg.tar.xz' : 'ffmpeg.zip');
  console.log(`[fetch-ffmpeg] downloading ${asset.url}`);
  await download(asset.url, archive);
  const actual = await sha256File(archive);
  if (actual !== asset.sha256) {
    rmSync(archive, { force: true });
    throw new Error(`[fetch-ffmpeg] checksum mismatch: expected ${asset.sha256}, got ${actual}`);
  }
  const unpacked = join(DOWNLOAD_DIR, 'ffmpeg-unpacked');
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  try {
    execFileSync('tar', ['-xf', archive, '-C', unpacked], { stdio: 'inherit' });
  } catch {
    execFileSync('unzip', ['-q', '-o', archive, '-d', unpacked], { stdio: 'inherit' });
  }
  // Clear the folder but keep its .gitkeep (the folder is tracked, its contents are not).
  mkdirSync(VENDOR_DIR, { recursive: true });
  for (const name of readdirSync(VENDOR_DIR)) {
    if (name !== '.gitkeep') rmSync(join(VENDOR_DIR, name), { recursive: true, force: true });
  }
  let kept = 0;
  for (const file of walk(unpacked)) {
    const name = keep(relative(unpacked, file));
    if (!name) continue;
    const target = join(VENDOR_DIR, name);
    mkdirSync(dirname(target), { recursive: true });
    // copyFileSync follows a link, so each library is a real file under the name asked for.
    copyFileSync(file, target);
    if (name.startsWith('bin/')) chmodSync(target, 0o755);
    kept += 1;
  }
  if (programs.some((program) => !existsSync(join(VENDOR_DIR, program)))) {
    throw new Error(`[fetch-ffmpeg] the archive had no ${programs.join(' or ')}`);
  }
  writeFileSync(STAMP, asset.sha256);
  rmSync(unpacked, { recursive: true, force: true });
  rmSync(archive, { force: true });
  console.log(`[fetch-ffmpeg] bundled ${kept} files into ${VENDOR_DIR}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
