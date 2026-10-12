#!/usr/bin/env node
// Runs `npm audit --json` and fails on any high/critical vulnerability EXCEPT
// the explicitly accepted advisories below. Each accepted advisory must have
// a reason and a tracking reference -- do not add one without both.
//
// History: 2026-09-05 accepted two image-size DoS advisories (transitive via
// pptxgenjs; no upstream fix existed then). image-size 2.0.4 patched both, and
// on 2026-09-30 the package.json override was raised to ^2.0.4 and the
// exceptions were removed. The list is empty: any new high/critical advisory
// fails CI until it is fixed or explicitly accepted here with a reason and a
// tracking reference.
//
// 2026-10-06: a braces ReDoS advisory (GHSA-vfj7-8cjw-p6xm) was briefly
// accepted here because it reached the repo only through tailwindcss 3.x's
// build-time scan. The Tailwind v4 migration removed that dependency chain, so
// the exception and its expiry guard were deleted; the list is empty again.
const ACCEPTED_ADVISORY_IDS = new Set();

import { execSync } from 'node:child_process';

function runAudit() {
  try {
    // Fixed, literal command -- no interpolated/user-controlled input, so a
    // plain shell string is safe here (avoids the npm.cmd spawnSync EINVAL
    // issue execFileSync hits on Windows without a shell).
    const out = execSync('npm audit --json', { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities are found; stdout still has the JSON.
    const out = err.stdout ? String(err.stdout) : '';
    if (!out.trim()) {
      console.error('npm audit produced no output to parse.');
      console.error(err.message);
      process.exit(1);
    }
    return JSON.parse(out);
  }
}

const report = runAudit();

// A genuine npm error (registry unreachable, auth failure, etc.) produces
// JSON with an `error` field and no `vulnerabilities` key at all -- treating
// that as "no vulnerabilities" would silently pass the gate on a report that
// was never actually generated. Fail loudly instead.
if (report.error && !report.vulnerabilities) {
  console.error('npm audit failed to produce a real report:');
  console.error(JSON.stringify(report.error, null, 2));
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities || {};

// `via` entries are either advisory objects (direct findings, carry a
// numeric `source` id) or plain package-name strings (this package is only
// vulnerable because it depends on that other, already-reported package).
// A package is "accepted" if every advisory id it carries directly is in
// ACCEPTED_ADVISORY_IDS, and every package name it points to is itself
// accepted -- resolved as a fixed point since the dependency chain here is
// shallow (image-size -> pptxgenjs).
function isAccepted(name, seen = new Set()) {
  if (seen.has(name)) return true; // cycle guard, shouldn't happen in practice
  seen.add(name);
  const vuln = vulnerabilities[name];
  if (!vuln) return true; // referenced package has no vulnerability entry of its own
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') return true;
  const via = Array.isArray(vuln.via) ? vuln.via : [];
  return via.every((v) => {
    if (typeof v === 'object' && v !== null) return ACCEPTED_ADVISORY_IDS.has(v.source);
    if (typeof v === 'string') return isAccepted(v, seen);
    return false;
  });
}

const unaccepted = [];
for (const [name, vuln] of Object.entries(vulnerabilities)) {
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue;
  if (!isAccepted(name)) {
    unaccepted.push({ name, severity: vuln.severity });
  }
}

if (unaccepted.length > 0) {
  console.error('npm audit found high/critical vulnerabilities not in the accepted list:');
  for (const item of unaccepted) {
    console.error(`  - ${item.name} (${item.severity})`);
  }
  process.exit(1);
}

console.log('npm audit: no unaccepted high/critical vulnerabilities found.');
if (Object.keys(vulnerabilities).length > 0) {
  console.log(`(${Object.keys(vulnerabilities).length} vulnerability group(s) present, all explicitly accepted -- see script header.)`);
}
