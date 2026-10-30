// Resource manager Task 10: Runtime Hub's Memory section.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

let latest: unknown = null;
const listeners = new Set<(s: unknown) => void>();
const setIdleMinutes = vi.fn();
vi.mock('../../../services/resources/idleStop', () => ({
  latestResources: () => latest,
  onResources: (l: (s: unknown) => void) => { listeners.add(l); return () => listeners.delete(l); },
  getIdleMinutes: (tool: string) => (tool === 'comfyui' ? 15 : null),
  setIdleMinutes: (...a: unknown[]) => setIdleMinutes(...a),
}));
const freeThings = vi.fn(async () => ({ freed: [], failed: [] }));
vi.mock('../../../services/resources/freeMemory', () => ({ freeThings: (...a: unknown[]) => freeThings(...(a as [])) }));
vi.mock('../../../services/resources/resourceState', () => ({
  GPU_UNKNOWN: 'Graphics memory unknown on this computer.',
  readResources: vi.fn(async () => latest),
}));
vi.mock('../../../services/resources/toolUse', () => ({ usageRecord: () => ({ lastUsedAt: () => null, isInUse: () => false }) }));

import { MemorySection } from '../../../components/resources/MemorySection';
import { createJoseRequest, setJoseRequestStatus, updateJoseStep } from '../../../services/jose/joseRequestStore';
import type { LoadedThing, ResourceState } from '../../../services/resources/resourceState';

const comfy: LoadedThing = { kind: 'tool', name: 'comfyui', label: 'ComfyUI', memMb: 3200, startedBy: 'alphonso', lastUsedAtMs: Date.now() - 5 * 60_000, inUse: false };
const ollama: LoadedThing = { kind: 'tool', name: 'ollama', label: 'Ollama', memMb: null, startedBy: 'you', lastUsedAtMs: null, inUse: false };
const model: LoadedThing = { kind: 'model', name: 'llama3.2:3b', label: 'llama3.2:3b', memMb: 2400, startedBy: 'you', lastUsedAtMs: null, inUse: true };
const state = (over: Partial<ResourceState> = {}): ResourceState => ({
  atMs: Date.now(), ramTotalMb: 16384, ramFreeMb: 6144, gpuTotalMb: 8192, gpuFreeMb: 2048, gpuSource: 'nvidia', loaded: [comfy, ollama, model], ...over,
});

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  vi.clearAllMocks();
  latest = state();
});

describe('MemorySection', () => {
  it('shows memory and one row per running tool and loaded model', () => {
    render(<MemorySection />);
    expect(screen.getByTestId('memory-ram').textContent).toContain('10.0 GB of 16.0 GB used');
    expect(screen.getByTestId('memory-gpu').textContent).toContain('6.0 GB of 8.0 GB used');
    const row = screen.getByTestId('memory-row-comfyui').textContent || '';
    expect(row).toContain('ComfyUI');
    expect(row).toContain('3.1 GB');
    expect(row).toContain('Started by Alphonso');
    expect(row).toContain('Idle 5 min');
    expect(screen.getByTestId('memory-row-ollama').textContent).toContain('Started by you');
    expect(screen.getByTestId('memory-row-llama3.2:3b').textContent).toContain('In use');
  });

  it('offers Stop only for tools Alphonso started, and Unload for an idle model', () => {
    latest = state({ loaded: [comfy, ollama, { ...model, inUse: false }] });
    render(<MemorySection />);
    expect(screen.getByTestId('memory-stop-comfyui')).toBeTruthy();
    expect(screen.queryByTestId('memory-stop-ollama')).toBeNull();
    fireEvent.click(screen.getByTestId('memory-unload-llama3.2:3b'));
    expect(freeThings).toHaveBeenCalledWith([{ ...model, inUse: false }]);
  });

  it('no Unload for a model a step is using', () => {
    render(<MemorySection />);
    expect(screen.queryByTestId('memory-unload-llama3.2:3b')).toBeNull();
  });

  it('saves a tool\'s idle time', () => {
    render(<MemorySection />);
    fireEvent.change(screen.getByTestId('memory-idle-comfyui'), { target: { value: '30' } });
    expect(setIdleMinutes).toHaveBeenCalledWith('comfyui', 30);
    fireEvent.change(screen.getByTestId('memory-idle-comfyui'), { target: { value: 'never' } });
    expect(setIdleMinutes).toHaveBeenCalledWith('comfyui', null);
  });

  it('says when graphics memory is unknown', () => {
    latest = state({ gpuTotalMb: null, gpuFreeMb: null, gpuSource: 'unknown' });
    render(<MemorySection />);
    expect(screen.getByTestId('memory-gpu').textContent).toBe('Graphics memory unknown on this computer.');
  });

  it('lists steps waiting for memory', () => {
    const request = createJoseRequest({ commandId: 'c1', source: 'user', text: 'x', kind: 'normal', steps: [{ stepId: 'miya', agent: 'miya', actionType: 'creative_scenes', effects: [], needs: [] } as never] });
    setJoseRequestStatus(request.id, 'running');
    updateJoseStep(request.id, 'miya', { waitingFor: 'Waiting for memory: ComfyUI is busy.', waitingSinceMs: 1 });
    render(<MemorySection />);
    expect(screen.getByTestId('memory-waiting').textContent).toContain('Miya: Waiting for memory: ComfyUI is busy.');
  });

  it('updates on a new reading', () => {
    render(<MemorySection />);
    act(() => { for (const l of [...listeners]) l(state({ ramFreeMb: 12288, loaded: [] })); });
    expect(screen.getByTestId('memory-ram').textContent).toContain('4.0 GB of 16.0 GB used');
    expect(screen.queryByTestId('memory-row-comfyui')).toBeNull();
  });
});
