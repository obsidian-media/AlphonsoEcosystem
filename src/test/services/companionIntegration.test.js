/**
 * iOS companion wiring contract.
 *
 * These tests read the real Rust, Swift and frontend sources and assert that
 * the three sides still agree. The previous version of this file mocked
 * `invoke` and asserted on the mock's own return value, and built JSON
 * messages inside the test and asserted on them -- it could never fail, so it
 * gave false confidence about wiring it did not touch (and its hard-coded
 * "6 JSON-RPC methods" had already drifted from the router's real 9).
 *
 * Nothing here executes the Rust or Swift code. It checks the names and
 * constants that have to match across the boundary, which is exactly what
 * broke silently before (e.g. the Voice OS / Companion port collision).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SWIFT_ROOT = 'ios/AlphonsoCompanion/AlphonsoCompanion';

function walk(dir, accept, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, accept, out);
    else if (accept(rel)) out.push(rel);
  }
  return out;
}

const unique = (list) => [...new Set(list)].sort();

/** Names registered in tauri::generate_handler![...] as `companion_server::<name>`. */
function registeredCompanionCommands() {
  const lib = read('src-tauri/src/lib.rs');
  const start = lib.indexOf('generate_handler![');
  expect(start, 'generate_handler! block not found in lib.rs').toBeGreaterThan(-1);
  const block = lib.slice(start, lib.indexOf('])', start));
  return unique([...block.matchAll(/companion_server::(companion_[a-z_]+)/g)].map((m) => m[1]));
}

/** `#[tauri::command]` functions actually defined in companion_server.rs. */
function definedCompanionCommands() {
  const src = read('src-tauri/src/companion_server.rs');
  return unique(
    [...src.matchAll(/#\[tauri::command\]\s*pub\s+(?:async\s+)?fn\s+(companion_[a-z_]+)/g)].map((m) => m[1])
  );
}

/** Command names the React side passes to invoke(). Test files are excluded. */
function frontendCompanionInvokes() {
  const files = walk('src', (p) => /\.(js|jsx|ts|tsx)$/.test(p) && !p.includes(`${path.sep}test${path.sep}`));
  const names = [];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/invoke(?:<[^>]*>)?\(\s*['"`](companion_[a-z_]+)['"`]/g)) names.push(m[1]);
  }
  return unique(names);
}

/** JSON-RPC methods handled by companion_router.rs's `match req.method.as_str()`. */
function routerMethods() {
  const src = read('src-tauri/src/companion_router.rs');
  const start = src.indexOf('match req.method.as_str()');
  expect(start, 'method match not found in companion_router.rs').toBeGreaterThan(-1);
  const end = src.indexOf('_ =>', start);
  return unique([...src.slice(start, end).matchAll(/"([a-z_]+)"\s*=>/g)].map((m) => m[1]));
}

/** JSON-RPC methods the Swift app sends (dictionary literals and raw JSON strings). */
function swiftMethods() {
  const files = walk(SWIFT_ROOT, (p) => p.endsWith('.swift'));
  const names = [];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/"method"\s*:\s*"([a-z_]+)"/g)) names.push(m[1]);
  }
  return unique(names);
}

describe('iOS companion: Tauri command wiring', () => {
  it('registers every companion command the frontend invokes', () => {
    const registered = registeredCompanionCommands();
    const missing = frontendCompanionInvokes().filter((name) => !registered.includes(name));
    expect(missing, `invoked from the frontend but not in generate_handler!: ${missing.join(', ')}`).toEqual([]);
  });

  it('only registers commands that exist as #[tauri::command] functions', () => {
    const defined = definedCompanionCommands();
    const dangling = registeredCompanionCommands().filter((name) => !defined.includes(name));
    expect(dangling, `registered but not defined as a command: ${dangling.join(', ')}`).toEqual([]);
  });

  it('finds the commands this contract is meant to cover', () => {
    // Guards the parsers themselves: if a refactor moves the commands and the
    // regexes silently match nothing, the two tests above would pass vacuously.
    expect(registeredCompanionCommands()).toEqual(
      expect.arrayContaining(['companion_get_pin', 'companion_get_status', 'companion_set_enabled'])
    );
    expect(frontendCompanionInvokes().length).toBeGreaterThan(0);
  });
});

describe('iOS companion: JSON-RPC protocol', () => {
  it('lets the Swift app call only methods the Rust router handles', () => {
    const rust = new Set([...routerMethods(), 'authenticate']);
    const unknown = swiftMethods().filter((method) => !rust.has(method));
    expect(unknown, `sent by Swift but not handled by Rust: ${unknown.join(', ')}`).toEqual([]);
  });

  it('finds both sides of the protocol', () => {
    expect(routerMethods()).toEqual(expect.arrayContaining(['get_status', 'send_command', 'approve_task']));
    expect(swiftMethods()).toEqual(expect.arrayContaining(['authenticate', 'send_command']));
  });

  it('authenticates with a "pin" parameter on both sides', () => {
    const server = read('src-tauri/src/companion_server.rs');
    expect(server).toMatch(/req\.method == "authenticate"/);
    expect(server).toMatch(/"pin"/);

    const swift = read(`${SWIFT_ROOT}/Services/WebSocketService.swift`);
    const authBlock = swift.slice(swift.indexOf('"method": "authenticate"') - 200, swift.indexOf('"method": "authenticate"') + 300);
    expect(authBlock).toMatch(/"pin"/);
  });
});

describe('iOS companion: discovery and transport constants', () => {
  it('uses the same default port in Rust as the Swift app hard-codes', () => {
    // CLAUDE.md: the iOS app hard-codes this port, so changing the Rust default
    // without updating Swift breaks pairing with no error on either side.
    const rustPort = read('src-tauri/src/companion_types.rs').match(/port:\s*(\d+)/)?.[1];
    expect(rustPort).toBeDefined();

    for (const rel of [
      `${SWIFT_ROOT}/Services/MDNSService.swift`,
      `${SWIFT_ROOT}/Views/PairingView.swift`,
      `${SWIFT_ROOT}/Views/SettingsView.swift`,
    ]) {
      expect(read(rel), `${rel} should reference port ${rustPort}`).toContain(rustPort);
    }
  });

  it('advertises the same mDNS service type that Swift browses for', () => {
    const rustType = read('src-tauri/src/companion_discovery.rs').match(/service_type\s*=\s*"([^"]+)"/)?.[1];
    expect(rustType).toBeDefined();
    // Rust adds the trailing ".local." that Bonjour/NWBrowser omit.
    const swiftType = rustType.replace(/\.local\.$/, '');
    expect(read(`${SWIFT_ROOT}/Services/MDNSService.swift`)).toContain(`"${swiftType}"`);
  });

  it('keeps Voice OS off the companion port (the 2026-07-10 collision)', () => {
    const companionPort = read('src-tauri/src/companion_types.rs').match(/port:\s*(\d+)/)?.[1];
    const voicePort = read('src-tauri/src/voice_sidecar.rs').match(/\b(87\d\d)\b/)?.[1];
    expect(companionPort).toBeDefined();
    expect(voicePort).toBeDefined();
    expect(voicePort).not.toBe(companionPort);
  });
});
