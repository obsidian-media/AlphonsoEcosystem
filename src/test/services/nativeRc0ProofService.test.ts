import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { PROOF_AUTHORITY, hasRustProofReceipts, formatNativeProofDetail, formatNativeRc0ProofResult, runNativeRc0Proof } from '../../services/nativeRc0ProofService';
import { invoke } from '@tauri-apps/api/core';

describe('nativeRc0ProofService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PROOF_AUTHORITY', () => {
    it('defines RUST_ENGINE and JS_BRIDGE', () => {
      expect(PROOF_AUTHORITY.RUST_ENGINE).toBe('rust_engine');
      expect(PROOF_AUTHORITY.JS_BRIDGE).toBe('js_bridge');
    });
  });

  describe('hasRustProofReceipts', () => {
    it('returns true when sentinels contain 10_rc0_package_written.json', () => {
      expect(hasRustProofReceipts({
        sentinels: ['release/rc0/proof/10_rc0_package_written.json']
      })).toBe(true);
    });
    it('returns true when artifacts end with self-development-proof.md', () => {
      expect(hasRustProofReceipts({
        artifacts: ['release/rc0/self-development-proof.md']
      })).toBe(true);
    });
    it('returns false when no matching sentinels or artifacts', () => {
      expect(hasRustProofReceipts({
        sentinels: ['other.json'],
        artifacts: ['other.md']
      })).toBe(false);
    });
    it('returns false for empty input', () => {
      expect(hasRustProofReceipts()).toBe(false);
      expect(hasRustProofReceipts({})).toBe(false);
    });
    it('returns false for null arrays', () => {
      expect(hasRustProofReceipts({ sentinels: null, artifacts: null })).toBe(false);
    });
  });

  describe('formatNativeProofDetail', () => {
    it('returns default message for null proof', () => {
      const msg = formatNativeProofDetail(null);
      expect(msg).toContain('not been recorded');
    });
    it('returns Rust engine message for RUST_ENGINE authority', () => {
      const msg = formatNativeProofDetail({
        proofAuthority: 'rust_engine',
        proofMode: 'native_rc0_rust'
      });
      expect(msg).toContain('Rust engine');
    });
    it('returns JS bridge message for JS_BRIDGE authority', () => {
      const msg = formatNativeProofDetail({
        proofAuthority: 'js_bridge',
        proofMode: 'automated_native'
      });
      expect(msg).toContain('JS bridge preview only');
    });
    it('returns runtime message when runtime is present', () => {
      const msg = formatNativeProofDetail({
        runtime: 'browser',
        proofMode: 'unknown'
      });
      expect(msg).toContain('browser');
    });
    it('returns default message for empty object', () => {
      const msg = formatNativeProofDetail({});
      expect(msg).toContain('not been recorded');
    });
  });

  describe('formatNativeRc0ProofResult', () => {
    it('returns "failed" state for empty input (ok is falsy)', () => {
      const result = formatNativeRc0ProofResult({});
      expect(result.runtime).toBe('native_tauri');
      expect(result.proofAuthority).toBe('rust_engine');
      expect(result.state).toBe('failed');
      expect(result.filesScanned).toBe(0);
      expect(result.p0Count).toBe(0);
    });
    it('returns "confirmed" state when ok is true and no blockers', () => {
      const result = formatNativeRc0ProofResult({ ok: true });
      expect(result.state).toBe('confirmed');
    });
    it('returns "blocked" state when p0Count > 0', () => {
      const result = formatNativeRc0ProofResult({ ok: true, p0Count: 1 });
      expect(result.state).toBe('blocked');
    });
    it('returns "partial" state when p1Count > 0', () => {
      const result = formatNativeRc0ProofResult({ ok: true, p1Count: 1 });
      expect(result.state).toBe('partial');
    });
    it('returns "partial" state when p2Count > 0', () => {
      const result = formatNativeRc0ProofResult({ ok: true, p2Count: 1 });
      expect(result.state).toBe('partial');
    });
    it('returns "failed" state when ok is false', () => {
      const result = formatNativeRc0ProofResult({ ok: false, error: 'something broke' });
      expect(result.state).toBe('failed');
      expect(result.error).toBe('something broke');
    });
    it('returns "setup_required" state for workspace validation error', () => {
      const result = formatNativeRc0ProofResult({
        ok: false,
        error: 'workspace validation failed: missing entries'
      });
      expect(result.state).toBe('setup_required');
      expect(result.workspaceRootValid).toBe(false);
    });
    it('normalizes top packets', () => {
      const result = formatNativeRc0ProofResult({
        topPackets: [
          { packetId: 'p1', title: 'Packet 1', priority: 'P0', riskLevel: 'high' },
          { packet_id: 'p2', title: 'Packet 2', priority: 'P1', risk_level: 'medium' }
        ]
      });
      expect(result.topPackets.length).toBe(2);
      expect(result.topPackets[0].id).toBe('p1');
      expect(result.topPackets[1].id).toBe('p2');
    });
    it('caps top packets at 10', () => {
      const packets = Array.from({ length: 15 }, (_, i) => ({ packetId: `p${i}`, title: `P${i}` }));
      const result = formatNativeRc0ProofResult({ topPackets: packets });
      expect(result.topPackets.length).toBe(10);
    });
    it('uses fallback workspace root', () => {
      const result = formatNativeRc0ProofResult({}, '/fallback');
      expect(result.workspaceRoot).toBe('/fallback');
    });
    it('includes proof path and readme path', () => {
      const result = formatNativeRc0ProofResult({
        artifacts: ['release/rc0/self-development-proof.md', 'release/rc0/README.md']
      });
      expect(result.rc0Proof.proofPath).toBe('release/rc0/self-development-proof.md');
      expect(result.rc0Proof.readmePath).toBe('release/rc0/README.md');
    });
    it('includes note about receipts when they exist', () => {
      const result = formatNativeRc0ProofResult({
        sentinels: ['release/rc0/proof/10_rc0_package_written.json']
      });
      expect(result.note).toContain('Rust RC0 proof engine wrote');
      expect(result.proofReceiptsWritten).toBe(true);
    });
    it('includes note about missing receipts when absent', () => {
      const result = formatNativeRc0ProofResult({ ok: true });
      expect(result.note).toContain('without 10_rc0_package_written.json');
      expect(result.proofReceiptsWritten).toBe(false);
    });
  });

  describe('runNativeRc0Proof', () => {
    it('invokes run_native_rc0_proof with correct input', async () => {
      (invoke as any).mockResolvedValueOnce({ ok: true, filesScanned: 10 });
      const result = await runNativeRc0Proof({
        workspaceRoot: '/workspace',
        outputDir: 'release/rc0',
        mode: 'supervised',
        maxFiles: 240
      });
      expect(invoke).toHaveBeenCalledWith('run_native_rc0_proof', {
        input: {
          workspaceRoot: '/workspace',
          outputDir: 'release/rc0',
          mode: 'supervised',
          maxFiles: 240
        }
      });
      expect(result.ok).toBe(true);
    });
    it('returns empty object for null result', async () => {
      (invoke as any).mockResolvedValueOnce(null);
      const result = await runNativeRc0Proof({});
      expect(result).toEqual({});
    });
  });
});
