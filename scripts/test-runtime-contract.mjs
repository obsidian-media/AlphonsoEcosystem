import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const nvmVersion = readFileSync('.nvmrc', 'utf8').trim();
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');

assert.equal(packageJson.engines?.node, '22.x', 'package.json must declare Node 22.x');
assert.equal(nvmVersion, '22', '.nvmrc must select Node 22');
assert.equal(
  (ciWorkflow.match(/node-version: 22/g) || []).length,
  5,
  'all CI Node setup steps must use Node 22',
);

console.log('[runtime-contract] Node 22 is consistent across package metadata, local tooling, and CI.');
