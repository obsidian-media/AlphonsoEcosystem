#!/usr/bin/env node
/**
 * Linux Dependency Verification Script
 * Checks for required system dependencies for Tauri Linux builds
 */

import { execSync } from 'child_process';

const REQUIRED_PACKAGES = [
  'libwebkit2gtk-4.1-dev',
  'libappindicator3-dev',
  'librsvg2-dev',
  'patchelf',
];

const REQUIRED_RUNTIME = [
  'libwebkit2gtk-4.1-0',
  'libayatana-appindicator3-1',
  'librsvg2-2',
];

function checkPackage(pkg) {
  try {
    execSync(`dpkg -l ${pkg} 2>/dev/null | grep ^ii`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkRuntime(pkg) {
  try {
    execSync(`ldconfig -p | grep ${pkg}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

console.log('🔍 Checking Linux build dependencies...\n');

let allOk = true;

console.log('📦 Build-time packages (dev):');
for (const pkg of REQUIRED_PACKAGES) {
  const ok = checkPackage(pkg);
  console.log(`  ${ok ? '✅' : '❌'} ${pkg}`);
  if (!ok) allOk = false;
}

console.log('\n🏃 Runtime packages:');
for (const pkg of REQUIRED_RUNTIME) {
  const ok = checkRuntime(pkg);
  console.log(`  ${ok ? '✅' : '❌'} ${pkg}`);
  if (!ok) allOk = false;
}

console.log('\n' + '='.repeat(50));
if (allOk) {
  console.log('✅ All dependencies satisfied!');
  process.exit(0);
} else {
  console.log('❌ Missing dependencies. Install with:');
  console.log('   sudo apt-get update && sudo apt-get install -y \\');
  console.log('     libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf');
  process.exit(1);
}