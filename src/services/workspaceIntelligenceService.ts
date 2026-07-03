import { TRUST_STATES, timestampMs } from './trustModel';
import { invoke } from '@tauri-apps/api/core';

const KEY = 'alphonso_workspace_intelligence_v1';

interface CapabilityState {
  visibleOnly: boolean;
  permissionRequired: boolean;
  localOnly: boolean;
  enabled: boolean;
  verificationState: string;
}

interface WorkspaceFoundation {
  ocr: CapabilityState;
  screenCapture: CapabilityState;
  screenshotProof: {
    enabled: boolean;
    ocrReady: boolean;
    visualVerificationReady: boolean;
    verificationState: string;
  };
  astIndexing: {
    enabled: boolean;
    verificationState: string;
  };
  editorAwareness: {
    enabled: boolean;
    verificationState: string;
  };
  workspaceProof: {
    lastRunAt: number | null;
    trust: string;
  };
  ocrCapability: {
    available: boolean;
    engine: string;
    message: string;
    checkedAtMs: number | null;
    verificationState: string;
  };
  updatedAt: number;
}

export type { WorkspaceFoundation };

const DEFAULT_FOUNDATION: WorkspaceFoundation = {
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

export function getWorkspaceFoundation(): WorkspaceFoundation {
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

export function updateWorkspaceFoundation(next: Partial<WorkspaceFoundation>): WorkspaceFoundation {
  const current = getWorkspaceFoundation();
  const merged = {
    ...current,
    ...next,
    updatedAt: timestampMs()
  };
  localStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export async function collectWorkspaceProof(root: string, maxFiles = 1200) {
  return invoke('collect_workspace_proof', {
    root,
    maxFiles
  });
}

export async function checkOcrCapability(enginePath?: string) {
  return invoke('check_ocr_capability', {
    enginePath: enginePath || null
  });
}

export async function runOcrAdapter({
  adapter = 'version_check',
  enginePath,
  imagePath = null,
  extraArgs = []
}: {
  adapter?: string;
  enginePath?: string;
  imagePath?: string | null;
  extraArgs?: string[];
}) {
  return invoke('run_ocr_adapter', {
    adapter,
    enginePath,
    imagePath,
    extraArgs
  });
}

export async function buildWorkspaceSymbolIndex(root: string, maxFiles = 500) {
  return invoke('build_workspace_symbol_index', {
    root,
    maxFiles
  });
}
