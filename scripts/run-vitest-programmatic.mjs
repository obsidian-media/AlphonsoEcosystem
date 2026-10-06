import { startVitest } from 'vitest/node';
import { configDefaults } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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

const sanitizedNodeOptions = sanitizeNodeOptions(process.env.NODE_OPTIONS || '');
if (sanitizedNodeOptions) {
  process.env.NODE_OPTIONS = sanitizedNodeOptions;
} else {
  delete process.env.NODE_OPTIONS;
}

const sanitizedNpmNodeOptions = sanitizeNodeOptions(process.env.npm_config_node_options || '');
if (sanitizedNpmNodeOptions) {
  process.env.npm_config_node_options = sanitizedNpmNodeOptions;
} else {
  delete process.env.npm_config_node_options;
}

const filters = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const watch = process.argv.includes('--watch');

// The first argument of startVitest is the vitest *mode* ('test' | 'benchmark'),
// not run-vs-watch. Passing 'run' made vitest 4 collect files but never execute
// a test body, so a failing test reported "passed" and `npm test` always exited
// 0. Run-vs-watch is controlled by the `run`/`watch` options below.
const ctx = await startVitest(
  'test',
  filters,
  {
    run: !watch,
    watch,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setupTests.js'],
    // configFile is false, so vitest's default include pattern applies and the
    // `src` filter would also match gateway/*/src/*.test.mjs. Those are Node
    // built-in test-runner files, run separately by CI's "Cloud Voice &
    // Gateway Tests" job, so keep them (and the Python voice tree) out of here.
    exclude: [...configDefaults.exclude, 'gateway/**', 'voice/**'],
    pool: 'forks',
    fileParallelism: false,
    configFile: false
  },
  {
    configFile: false,
    // Mirror vitest.config.js: bridge/server.js imports express, which the
    // bridge tests replace with a mock.
    resolve: { alias: { express: path.join(root, 'bridge/tests/__mocks__/express.js') } }
  }
);

if (ctx && !ctx.shouldKeepServer()) {
  // Propagate failures: ctx.exit() alone does not set a non-zero exit code.
  const failed = ctx.state.getCountOfFailedTests() > 0 || ctx.state.getFiles().some((f) => f.result?.state === 'fail');
  await ctx.exit();
  if (failed) process.exitCode = 1;
}
