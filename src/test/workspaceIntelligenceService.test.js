import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

import { invoke } from '@tauri-apps/api/core';
import {
  getWorkspaceFoundation,
  updateWorkspaceFoundation,
  collectWorkspaceProof,
  checkOcrCapability,
  runOcrAdapter,
  buildWorkspaceSymbolIndex
} from '../services/workspaceIntelligenceService';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('getWorkspaceFoundation', () => {
  it('returns the default foundation when storage is empty', () => {
    const foundation = getWorkspaceFoundation();
    expect(foundation).toBeDefined();
    expect(foundation.ocr).toBeDefined();
    expect(foundation.screenCapture).toBeDefined();
  });

  it('seeds localStorage with default on first call', () => {
    getWorkspaceFoundation();
    const raw = localStorage.getItem('alphonso_workspace_intelligence_v1');
    expect(raw).not.toBeNull();
  });

  it('returns stored value when already present', () => {
    const custom = { ocr: { enabled: true }, updatedAt: Date.now() };
    localStorage.setItem('alphonso_workspace_intelligence_v1', JSON.stringify(custom));
    const result = getWorkspaceFoundation();
    expect(result.ocr.enabled).toBe(true);
  });

  it('returns default when localStorage contains invalid JSON', () => {
    localStorage.setItem('alphonso_workspace_intelligence_v1', 'not-json');
    const result = getWorkspaceFoundation();
    expect(result.ocr).toBeDefined();
  });
});

describe('updateWorkspaceFoundation', () => {
  it('merges patch fields into the foundation', () => {
    const updated = updateWorkspaceFoundation({ astIndexing: { enabled: true } });
    expect(updated.astIndexing.enabled).toBe(true);
  });

  it('preserves existing fields not in the patch', () => {
    getWorkspaceFoundation();
    const updated = updateWorkspaceFoundation({ astIndexing: { enabled: true } });
    expect(updated.ocr).toBeDefined();
  });

  it('updates the updatedAt timestamp', () => {
    const before = Date.now();
    const updated = updateWorkspaceFoundation({});
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('collectWorkspaceProof', () => {
  it('calls invoke with collect_workspace_proof', async () => {
    invoke.mockResolvedValue({ files: 5 });
    await collectWorkspaceProof('/workspace', 100);
    expect(invoke).toHaveBeenCalledWith('collect_workspace_proof', { root: '/workspace', maxFiles: 100 });
  });

  it('uses default maxFiles of 1200', async () => {
    invoke.mockResolvedValue({});
    await collectWorkspaceProof('/workspace');
    expect(invoke).toHaveBeenCalledWith('collect_workspace_proof', { root: '/workspace', maxFiles: 1200 });
  });
});

describe('checkOcrCapability', () => {
  it('calls invoke with check_ocr_capability', async () => {
    invoke.mockResolvedValue({ available: true });
    await checkOcrCapability('/usr/bin/tesseract');
    expect(invoke).toHaveBeenCalledWith('check_ocr_capability', { enginePath: '/usr/bin/tesseract' });
  });

  it('passes null when no enginePath given', async () => {
    invoke.mockResolvedValue({});
    await checkOcrCapability(undefined);
    expect(invoke).toHaveBeenCalledWith('check_ocr_capability', { enginePath: null });
  });
});

describe('runOcrAdapter', () => {
  it('calls invoke with run_ocr_adapter and provided args', async () => {
    invoke.mockResolvedValue({ output: 'version 5.0' });
    await runOcrAdapter({ adapter: 'version_check', enginePath: '/bin/tesseract' });
    expect(invoke).toHaveBeenCalledWith('run_ocr_adapter', expect.objectContaining({ adapter: 'version_check' }));
  });
});

describe('buildWorkspaceSymbolIndex', () => {
  it('calls invoke with build_workspace_symbol_index', async () => {
    invoke.mockResolvedValue({ symbols: 12 });
    await buildWorkspaceSymbolIndex('/workspace', 200);
    expect(invoke).toHaveBeenCalledWith('build_workspace_symbol_index', { root: '/workspace', maxFiles: 200 });
  });
});
