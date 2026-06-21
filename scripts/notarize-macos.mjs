#!/usr/bin/env node
/**
 * macOS Notarization Script
 * Submits DMG to Apple for notarization and staples the ticket
 */

import { execSync } from 'child_process';
import { globSync } from 'glob';
import fs from 'fs';

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: 'inherit', ...options }).toString().trim();
  } catch (e) {
    console.error(`❌ Command failed: ${cmd}`);
    throw e;
  }
}

function findArtifacts() {
  const dmgFiles = globSync('src-tauri/target/release/bundle/dmg/*.dmg');
  const appFiles = globSync('src-tauri/target/release/bundle/macos/*.app');
  return { dmgFiles, appFiles };
}

async function notarize() {
  console.log('🔍 Finding macOS artifacts...');
  const { dmgFiles, appFiles } = findArtifacts();

  if (dmgFiles.length === 0) {
    console.error('❌ No DMG files found. Run `cargo tauri build` first.');
    process.exit(1);
  }

  const dmg = dmgFiles[0];
  console.log(`📦 Found DMG: ${dmg}`);

  const appleId = process.env.APPLE_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const appPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;

  if (!appleId || !teamId || !appPassword) {
    console.error('❌ Missing environment variables:');
    console.error('   APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD');
    process.exit(1);
  }

  console.log('🚀 Submitting for notarization...');
  run(`xcrun notarytool submit "${dmg}" \
    --apple-id "${appleId}" \
    --team-id "${teamId}" \
    --password "${appPassword}" \
    --wait`);

  console.log('📎 Stapling notarization ticket...');
  run(`xcrun stapler staple "${dmg}"`);

  console.log('✅ Notarization complete!');
  console.log(`   Notarized: ${dmg}`);
}

notarize().catch(() => process.exit(1));