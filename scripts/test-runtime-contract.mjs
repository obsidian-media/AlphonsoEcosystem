import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const nvmVersion = readFileSync('.nvmrc', 'utf8').trim();
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const groundTruth = readFileSync('docs/ALPHONSO_GROUND_TRUTH.md', 'utf8');
const architecture = readFileSync('ARCHITECTURE.md', 'utf8');

assert.equal(packageJson.engines?.node, '22.x', 'package.json must declare Node 22.x');
assert.equal(nvmVersion, '22', '.nvmrc must select Node 22');
assert.equal(
  (ciWorkflow.match(/node-version: 22/g) || []).length,
  5,
  'all CI Node setup steps must use Node 22',
);
assert.match(groundTruth, /\| Version \| 2\.6\.0 \|/, 'ground truth must name the current version');
assert.match(groundTruth, /Vite 8/, 'ground truth must name the installed Vite major version');
assert.doesNotMatch(groundTruth, /0 subdirectory `\.jsx`/, 'ground truth must not claim production JSX is gone');
assert.match(architecture, /Vite 8/, 'architecture must name the installed Vite major version');
assert.doesNotMatch(architecture, /100% `\.tsx`/, 'architecture must not claim production JSX is gone');

console.log('[runtime-contract] Node 22 is consistent across package metadata, local tooling, and CI.');
