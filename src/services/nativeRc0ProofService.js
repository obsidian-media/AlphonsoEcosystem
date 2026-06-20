import { invoke } from '@tauri-apps/api/core';

export const PROOF_AUTHORITY = {
  RUST_ENGINE: 'rust_engine',
  JS_BRIDGE: 'js_bridge'
};

function firstArtifactPath(artifacts = [], suffix) {
  return Array.isArray(artifacts)
    ? artifacts.find((entry) => String(entry || '').replace(/\\/g, '/').endsWith(suffix)) || null
    : null;
}

export function hasRustProofReceipts(result = {}) {
  const sentinels = Array.isArray(result.sentinels) ? result.sentinels : [];
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  return sentinels.some((entry) => String(entry || '').replace(/\\/g, '/').includes('10_rc0_package_written.json'))
    || artifacts.some((entry) => String(entry || '').replace(/\\/g, '/').endsWith('self-development-proof.md'));
}

function normalizeState(result) {
  if (!result?.ok) {
    const error = String(result?.error || '').toLowerCase();
    if (error.includes('workspace validation') || error.includes('missing entries')) {
      return 'setup_required';
    }
    return 'failed';
  }
  if (Number(result?.p0Count || 0) > 0) {
    return 'blocked';
  }
  if (Number(result?.p1Count || 0) > 0 || Number(result?.p2Count || 0) > 0) {
    return 'partial';
  }
  return 'confirmed';
}

function normalizeWorkspaceRootValid(result) {
  const error = String(result?.error || '').toLowerCase();
  if (error.includes('workspace validation') || error.includes('missing entries')) {
    return false;
  }
  if (Number(result?.filesScanned || 0) > 0) {
    return true;
  }
  return Boolean(result?.ok);
}

function normalizeTopPackets(packets = []) {
  return packets.slice(0, 10).map((packet) => ({
    id: packet.packetId || packet.packet_id || packet.id || '',
    title: packet.title || '',
    priority: packet.priority || '',
    riskLevel: packet.riskLevel || packet.risk_level || ''
  }));
}

export function formatNativeProofDetail(proof) {
  if (!proof) {
    return 'Native proof has not been recorded yet. Run the Rust-backed proof cycle or verify release/rc0/proof/*.json on disk.';
  }
  if (proof.proofAuthority === PROOF_AUTHORITY.RUST_ENGINE || proof.proofMode === 'native_rc0_rust' || proof.proofMode === 'supervised') {
    return `Rust engine (${proof.proofMode || 'native run'}). Verify artifacts under release/rc0/proof/*.json on disk.`;
  }
  if (proof.proofAuthority === PROOF_AUTHORITY.JS_BRIDGE || proof.proofMode === 'automated_native') {
    return 'JS bridge preview only. Rust RC0 engine is proof authority; disk artifacts are the source of truth.';
  }
  if (proof.runtime) {
    return `${proof.runtime} (${proof.proofMode || 'unknown mode'}). Confirm release/rc0 artifacts on disk before treating proof as complete.`;
  }
  return 'Native proof has not been recorded yet.';
}

export function formatNativeRc0ProofResult(result = {}, fallbackWorkspaceRoot = '') {
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  const outputDir = String(result.outputDir || 'release/rc0').trim() || 'release/rc0';
  const proofPath = firstArtifactPath(artifacts, 'self-development-proof.md') || `${outputDir}/self-development-proof.md`;
  const readmePath = firstArtifactPath(artifacts, 'README.md') || `${outputDir}/README.md`;
  const receiptsWritten = hasRustProofReceipts(result);
  const state = normalizeState(result);
  return {
    runtime: 'native_tauri',
    proofAuthority: PROOF_AUTHORITY.RUST_ENGINE,
    proofMode: String(result.mode || 'automated'),
    autorun: false,
    state,
    workspaceRoot: String(result.workspaceRoot || fallbackWorkspaceRoot || '').trim(),
    workspaceRootValid: normalizeWorkspaceRootValid(result),
    filesScanned: Number(result.filesScanned || 0),
    p0Count: Number(result.p0Count || 0),
    p1Count: Number(result.p1Count || 0),
    p2Count: Number(result.p2Count || 0),
    topPackets: normalizeTopPackets(result.topPackets),
    exportPath: proofPath,
    proofReceiptsWritten: receiptsWritten,
    rc0Proof: {
      proofPath,
      readmePath,
      artifacts,
      sentinels: Array.isArray(result.sentinels) ? result.sentinels : []
    },
    timestampMs: Date.now(),
    note: result.error
      ? String(result.error)
      : receiptsWritten
        ? 'Rust RC0 proof engine wrote release/rc0 artifacts.'
        : 'Rust proof run finished without 10_rc0_package_written.json; treat as partial until artifacts exist on disk.',
    error: result.ok ? null : String(result.error || 'Native RC0 proof failed')
  };
}

export async function runNativeRc0Proof({
  workspaceRoot,
  outputDir = 'release/rc0',
  mode = 'supervised',
  maxFiles = 240
} = {}) {
  const result = await invoke('run_native_rc0_proof', {
    input: {
      workspaceRoot,
      outputDir,
      mode,
      maxFiles
    }
  });
  return result || {};
}
