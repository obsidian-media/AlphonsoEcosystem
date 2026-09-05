#!/usr/bin/env node
// Runs `npm audit --json` and fails on any high/critical vulnerability EXCEPT
// the explicitly accepted advisories below. Each accepted advisory must have
// a reason and a tracking reference -- do not add one without both.
//
// Accepted 2026-09-05 (Hector research-synthesis PDF/PPTX export, PR TBD):
// image-size (transitive dep of pptxgenjs) has two unpatched DoS advisories.
// GitHub's advisory API confirms first_patched_version: null for both --
// no fixed release exists upstream. Hector's export code
// (src/services/hectorExportService.ts) only calls pptx.addText()/addSlide()/
// writeFile(), never addImage(), so the vulnerable image-parsing code paths
// (ICNS/JXL/HEIF parsers) are never reached. Tracked in
// docs/governance/DEFERRED_WORK.md.
const ACCEPTED_ADVISORY_IDS = new Set([
  1138808, // GHSA-w3rx-r6r6-pgpr -- image-size ICNS parser infinite loop DoS
  1138809 // GHSA-5p2g-fcmc-qvqq -- image-size JXL/HEIF parsers infinite loop DoS
]);

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
