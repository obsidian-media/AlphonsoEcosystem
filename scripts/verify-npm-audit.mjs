#!/usr/bin/env node
// Fails on any high/critical npm advisory affecting an installed package,
// EXCEPT the explicitly accepted advisories below. Each accepted advisory must
// have a reason and a tracking reference -- do not add one without both.
//
// How it checks (2026-10-22): every package and version in package-lock.json
// is sent to npm's bulk advisory endpoint, and each advisory is matched
// against the installed version with semver. It used to run `npm audit
// --json`, but npm retired the "quick" audit endpoint that command fell back
// to ("This endpoint is being retired. Use the bulk advisory endpoint
// instead", HTTP 400), which failed every CI run. The rules are unchanged: dev
// dependencies count, and a registry error fails the gate rather than passing.
//
// History: 2026-09-05 accepted two image-size DoS advisories (transitive via
// pptxgenjs; no upstream fix existed then). image-size 2.0.4 patched both, and
// on 2026-09-30 the package.json override was raised to ^2.0.4 and the
// exceptions were removed. 2026-10-06: a braces ReDoS advisory was briefly
// accepted (tailwindcss 3.x); the Tailwind v4 migration removed it. The list
// is empty: any new high/critical advisory fails CI until it is fixed or
// explicitly accepted here with a reason and a tracking reference.
const ACCEPTED_ADVISORY_IDS = new Set();

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const semver = require('semver');

const BULK_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const CHUNK = 400;

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(1);
}

/** name -> Set(versions) for every installed package in package-lock.json. */
export function installedPackages(lock) {
  const out = new Map();
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    if (!key || entry.link || !entry.version) continue;
    const name = entry.name || key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!name) continue;
    if (!out.has(name)) out.set(name, new Set());
    out.get(name).add(entry.version);
  }
  return out;
}

/** High/critical advisories (not accepted) that affect an installed version. */
export function findUnaccepted(advisoriesByName, installed) {
  const found = [];
  for (const [name, advisories] of Object.entries(advisoriesByName)) {
    for (const advisory of advisories || []) {
      if (advisory.severity !== 'high' && advisory.severity !== 'critical') continue;
      if (ACCEPTED_ADVISORY_IDS.has(advisory.id)) continue;
      const hit = [...(installed.get(name) || [])].filter((v) =>
        semver.satisfies(v, advisory.vulnerable_versions || '<0.0.0', { includePrerelease: true })
      );
      if (hit.length) found.push({ name, versions: hit, severity: advisory.severity, id: advisory.id, url: advisory.url, title: advisory.title });
    }
  }
  return found;
}

async function main() {
  let lock;
  try {
    lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  } catch (error) {
    fail('Could not read package-lock.json.', String(error));
  }
  const installed = installedPackages(lock);
  if (installed.size === 0) fail('package-lock.json lists no installed packages; refusing to report "no vulnerabilities".');

  const names = [...installed.keys()];
  const advisoriesByName = {};
  for (let i = 0; i < names.length; i += CHUNK) {
    const body = Object.fromEntries(names.slice(i, i + CHUNK).map((n) => [n, [...installed.get(n)]]));
    // Each request gets 60 s and one retry: a hung registry call must fail
    // the gate, not stall CI.
    let response;
    for (let attempt = 1; attempt <= 2 && !response; attempt++) {
      try {
        response = await fetch(BULK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000)
        });
      } catch (error) {
        if (attempt === 2) fail('npm advisory lookup failed (registry unreachable or too slow):', String(error));
      }
    }
    if (!response.ok) fail(`npm advisory lookup failed: HTTP ${response.status}`, await response.text().catch(() => ''));
    const json = await response.json().catch(() => null);
    if (!json || typeof json !== 'object' || Array.isArray(json)) fail('npm advisory lookup returned an unexpected response.');
    Object.assign(advisoriesByName, json);
  }

  const unaccepted = findUnaccepted(advisoriesByName, installed);
  if (unaccepted.length > 0) {
    console.error('npm advisories: high/critical vulnerabilities not in the accepted list:');
    for (const item of unaccepted) {
      console.error(`  - ${item.name}@${item.versions.join(',')} (${item.severity}) ${item.title || ''} ${item.url || ''}`);
    }
    process.exit(1);
  }
  console.log(`npm advisories: no unaccepted high/critical vulnerabilities in ${installed.size} installed packages.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
