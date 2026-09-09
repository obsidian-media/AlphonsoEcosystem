// Dependency Bundling Plan (docs/DEPENDENCY_BUNDLING_PLAN.md), task O2.
//
// Downloads the pinned starter model (STARTER_MODEL_TAG in
// src/services/setupFlowService.ts) directly from Ollama's own registry API
// and stages it into src-tauri/vendor/starter-model/ in Ollama's real
// on-disk model-store layout (models/blobs/sha256-<digest>,
// models/manifests/registry.ollama.ai/<namespace>/<name>/<tag>) -- verified
// byte-for-byte against a real local Ollama install's own store (same
// manifest JSON, same blob filenames) before writing this script, not
// assumed from documentation. tauri.conf.json's bundle.resources entry
// stages this into the installer so the model ships with the app instead of
// being pulled over the network on first launch.
//
// Self-verifying by construction: each blob's filename IS its own sha256
// digest (Ollama's content-addressed store), so downloading the blob named
// sha256-<digest> and re-hashing it to confirm the name matches is the
// checksum check -- no separate published-checksum list to keep in sync,
// unlike fetch-ollama-runtime.mjs's pinned ASSETS table.
//
// Pinned via the model tag in setupFlowService.ts, not "latest" -- if that
// tag ever changes, re-run this script; it always resolves whatever
// STARTER_MODEL_TAG currently says, not a separately-pinned model version.
//
// NOT wired to any boot-time consumer yet (that's a separate step -- a Rust
// Tauri command to copy this staged store into the user's real OLLAMA_MODELS
// directory on first launch, if the model isn't already present). This
// script only gets the verified bytes into vendor/ so that wiring has
// something real to consume; see DEPENDENCY_BUNDLING_PLAN.md's O2 entry.

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(PROJECT_ROOT, 'src-tauri', 'vendor', 'starter-model');
const REGISTRY_BASE = 'https://registry.ollama.ai';

async function readStarterModelTag() {
  const source = await readFile(
    join(PROJECT_ROOT, 'src', 'services', 'setupFlowService.ts'),
    'utf8'
  );
  const match = source.match(/STARTER_MODEL_TAG\s*=\s*'([^']+)'/);
  if (!match) {
    throw new Error(
      "Could not find STARTER_MODEL_TAG in setupFlowService.ts -- this script reads it " +
      'directly from source so the two can never silently drift apart.'
    );
  }
  return match[1];
}

// Ollama model references are namespace/name:tag, with an implicit
// "library" namespace when none is given (e.g. "llama3.2:3b" ==
// "library/llama3.2:3b") -- verified against the real registry API returning
// identical content for both forms.
function parseModelRef(ref) {
  const [namePart, tag = 'latest'] = ref.split(':');
  const segments = namePart.split('/');
  const name = segments.pop();
  const namespace = segments.length > 0 ? segments.join('/') : 'library';
  return { namespace, name, tag };
}

async function fetchManifest(namespace, name, tag) {
  const url = `${REGISTRY_BASE}/v2/${namespace}/${name}/manifests/${tag}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.docker.distribution.manifest.v2+json' }
  });
  if (!response.ok) {
    throw new Error(`Manifest fetch failed: HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  return { text, json: JSON.parse(text) };
}

async function downloadBlob(namespace, name, digest, destPath) {
  const url = `${REGISTRY_BASE}/v2/${namespace}/${name}/blobs/${digest}`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Blob download failed: HTTP ${response.status} for ${url}`);
  }
  await pipeline(response.body, createWriteStream(destPath));

  const hash = createHash('sha256');
  const { createReadStream } = await import('node:fs');
  await pipeline(createReadStream(destPath), hash);
  const actual = `sha256:${hash.digest('hex')}`;
  if (actual !== digest) {
    throw new Error(
      `Checksum mismatch for blob ${digest}: got ${actual}. ` +
      'Refusing to stage an unverified model blob -- do not bypass this check.'
    );
  }
}

async function main() {
  const modelRef = await readStarterModelTag();
  const { namespace, name, tag } = parseModelRef(modelRef);

  process.stdout.write(`[fetch-starter-model] resolved STARTER_MODEL_TAG="${modelRef}" -> ${namespace}/${name}:${tag}\n`);

  rmSync(VENDOR_DIR, { recursive: true, force: true });
  const blobsDir = join(VENDOR_DIR, 'blobs');
  const manifestDir = join(VENDOR_DIR, 'manifests', 'registry.ollama.ai', namespace, name);
  await mkdir(blobsDir, { recursive: true });
  await mkdir(manifestDir, { recursive: true });

  process.stdout.write(`[fetch-starter-model] fetching manifest\n`);
  const { text: manifestText, json: manifest } = await fetchManifest(namespace, name, tag);

  const blobDigests = [manifest.config.digest, ...manifest.layers.map((l) => l.digest)];
  let totalBytes = 0;
  for (const digest of blobDigests) {
    const fileName = digest.replace(':', '-');
    const destPath = join(blobsDir, fileName);
    process.stdout.write(`[fetch-starter-model] downloading blob ${digest}\n`);
    await downloadBlob(namespace, name, digest, destPath);
    const { statSync } = await import('node:fs');
    totalBytes += statSync(destPath).size;
  }

  // Ollama's manifest filename is the bare tag, no extension -- matches the
  // real on-disk layout verified against a local install before writing
  // this script (see the file header).
  await writeFile(join(manifestDir, tag), manifestText, 'utf8');

  await writeFile(
    join(VENDOR_DIR, '.gitkeep'),
    'Re-created by scripts/fetch-starter-model.mjs after fetching -- vendor/ ' +
    'contents are gitignored and staged at build time, mirroring vendor/ollama/.\n',
    'utf8'
  );

  const gb = (totalBytes / 1024 / 1024 / 1024).toFixed(2);
  process.stdout.write(
    `[fetch-starter-model] staged ${blobDigests.length} verified blobs (${gb} GB) + manifest into ${VENDOR_DIR}\n`
  );
  process.stdout.write('[fetch-starter-model] done.\n');
}

main().catch((error) => {
  process.stderr.write(`[fetch-starter-model] Failed: ${String(error?.stack || error)}\n`);
  process.exit(1);
});
