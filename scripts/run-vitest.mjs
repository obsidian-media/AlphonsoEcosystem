import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vitestBin = require.resolve('vitest/vitest.mjs');

function sanitizeNodeOptions(raw) {
  if (!raw) return '';
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const lower = token.toLowerCase();
      return lower !== '--localstorage-file' && !lower.startsWith('--localstorage-file=');
    })
    .join(' ');
}

const env = { ...process.env };
const sanitizedNodeOptions = sanitizeNodeOptions(env.NODE_OPTIONS || '');
if (sanitizedNodeOptions) {
  env.NODE_OPTIONS = sanitizedNodeOptions;
} else {
  delete env.NODE_OPTIONS;
}

const child = spawn(process.execPath, [vitestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

