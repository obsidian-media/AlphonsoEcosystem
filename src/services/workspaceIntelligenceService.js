import { TRUST_STATES, timestampMs } from './trustModel';
import { invoke } from '@tauri-apps/api/core';

const KEY = 'alphonso_workspace_intelligence_v1';

const DEFAULT_FOUNDATION = {
  ocr: {
    visibleOnly: true,
    permissionRequired: true,
    localOnly: true,
    enabled: false,
    verificationState: TRUST_STATES.UNVERIFIED
  },
  screenCapture: {
    visibleOnly: true,
    permissionRequired: true,
    localOnly: true,
    enabled: false,
    verificationState: TRUST_STATES.UNVERIFIED
  },
  screenshotProof: {
    enabled: false,
    ocrReady: false,
    visualVerificationReady: false,
    verificationState: TRUST_STATES.UNVERIFIED
  },
  astIndexing: {
    enabled: false,
    verificationState: TRUST_STATES.UNVERIFIED
  },
  editorAwareness: {
    enabled: false,
    verificationState: TRUST_STATES.UNVERIFIED
  },
  workspaceProof: {
    lastRunAt: null,
    trust: TRUST_STATES.UNVERIFIED
  },
  ocrCapability: {
    available: false,
    engine: 'unconfigured',
    message: 'OCR engine is not configured yet.',
    checkedAtMs: null,
    verificationState: TRUST_STATES.UNVERIFIED
  },
  updatedAt: timestampMs()
};

export function getWorkspaceFoundation() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // fall through
  }
  localStorage.setItem(KEY, JSON.stringify(DEFAULT_FOUNDATION));
  return DEFAULT_FOUNDATION;
}

export function updateWorkspaceFoundation(next) {
  const current = getWorkspaceFoundation();
  const merged = {
    ...current,
    ...next,
    updatedAt: timestampMs()
  };
  localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export async function collectWorkspaceProof(root, maxFiles = 1200) {
  return invoke('collect_workspace_proof', {
    root,
    maxFiles
  });
}

export async function checkOcrCapability(enginePath) {
  return invoke('check_ocr_capability', {
    enginePath: enginePath || null
  });
}

export async function runOcrAdapter({
  adapter = 'version_check',
  enginePath,
  imagePath = null,
  extraArgs = []
}) {
  return invoke('run_ocr_adapter', {
    adapter,
    enginePath,
    imagePath,
    extraArgs
  });
}

export async function buildWorkspaceSymbolIndex(root, maxFiles = 500) {
  return invoke('build_workspace_symbol_index', {
    root,
    maxFiles
  });
}
