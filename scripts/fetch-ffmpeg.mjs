// Miya content factory phase 2a (owner, 2026-10-23): ffmpeg is bundled in the
// Windows installer, so assembly, captions and checks work right after install.
//
// An LGPL build only (most ready-made builds are GPL, which brings stricter
// terms when redistributed), the shared variant (ffmpeg and ffprobe share
// their libraries, which keeps the installer under its size ceiling next to
// the bundled Ollama), pinned to a dated release-branch build and checked
// against the SHA-256 GitHub records for that asset.
//
// Downloads into src-tauri/vendor/ffmpeg/, which tauri.conf.json stages into
// the installer as "ffmpeg". Run before `tauri build` (ci.yml, release.yml).
// Bump the URL and checksum together, from `gh api repos/BtbN/FFmpeg-Builds/
// releases/tags/<tag> --jq '.assets[] | .name + " " + .digest'`.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', 'ffmpeg');
const DOWNLOAD_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', '.download');

export const FFMPEG_ASSET = {
  url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-22-13-06/ffmpeg-n8.1.3-23-g5c4f5744cd-win64-lgpl-shared-8.1.zip',
  sha256: 'c41df73a3f3259e81d5d53e6ce0c4c80b4841a30894fb77954650e445daa6c53',
};

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
  if (existsSync(STAMP) && readFileSync(STAMP, 'utf8').trim() === FFMPEG_ASSET.sha256 && existsSync(join(VENDOR_DIR, 'ffmpeg.exe'))) {
    console.log('[fetch-ffmpeg] already present');
    return;
  }
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const archive = join(DOWNLOAD_DIR, 'ffmpeg.zip');
  console.log(`[fetch-ffmpeg] downloading ${FFMPEG_ASSET.url}`);
  await download(FFMPEG_ASSET.url, archive);
  const actual = await sha256File(archive);
  if (actual !== FFMPEG_ASSET.sha256) {
    rmSync(archive, { force: true });
    throw new Error(`[fetch-ffmpeg] checksum mismatch: expected ${FFMPEG_ASSET.sha256}, got ${actual}`);
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
    const name = KEEP_FILE(relative(unpacked, file));
    if (!name) continue;
    copyFileSync(file, join(VENDOR_DIR, name));
    kept += 1;
  }
  if (!existsSync(join(VENDOR_DIR, 'ffmpeg.exe')) || !existsSync(join(VENDOR_DIR, 'ffprobe.exe'))) {
    throw new Error('[fetch-ffmpeg] the archive had no ffmpeg.exe or ffprobe.exe');
  }
  writeFileSync(STAMP, FFMPEG_ASSET.sha256);
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
