import { build } from 'vite';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const MAIN_CHUNK_BUDGET_BYTES = 500_000;

async function enforceMainChunkBudget() {
  const assetsDir = join(root, 'dist', 'assets');
  const entries = await readdir(assetsDir, { withFileTypes: true });
  const indexChunk = entries.find((entry) => entry.isFile() && /^index-.*\.js$/i.test(entry.name));

  if (!indexChunk) {
    throw new Error('Main index chunk not found after build.');
  }

  const bundlePath = join(assetsDir, indexChunk.name);
  const bundleStat = await stat(bundlePath);

  if (bundleStat.size > MAIN_CHUNK_BUDGET_BYTES) {
    throw new Error(`Main chunk budget exceeded: ${indexChunk.name} is ${(bundleStat.size / 1024).toFixed(1)} KB, budget is ${(MAIN_CHUNK_BUDGET_BYTES / 1024).toFixed(1)} KB.`);
  }
}

await build({
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

await enforceMainChunkBudget();
