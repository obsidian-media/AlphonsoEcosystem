// Resource manager Task 8: a step runs when its memory fits, makes room first, waits, or fails as too big.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(() => Promise.resolve(null)) }));
const estimateNeed = vi.fn();
const recordStepUse = vi.fn();
vi.mock('../../../services/resources/stepNeeds', () => ({
  estimateNeed: (...a: unknown[]) => estimateNeed(...a),
  recordStepUse: (...a: unknown[]) => recordStepUse(...a),
}));
const readResources = vi.fn();
vi.mock('../../../services/resources/resourceState', () => ({ readResources: (...a: unknown[]) => readResources(...a) }));
let latest: unknown = null;
const listeners = new Set<(s: unknown) => void>();
vi.mock('../../../services/resources/idleStop', () => ({
  latestResources: () => latest,
  onResources: (l: (s: unknown) => void) => { listeners.add(l); return () => listeners.delete(l); },
}));
const freeThings = vi.fn();
vi.mock('../../../services/resources/freeMemory', () => ({ freeThings: (...a: unknown[]) => freeThings(...a) }));
const ensureTools = vi.fn();
vi.mock('../../../services/resources/ensureTools', () => ({ ensureTools: (...a: unknown[]) => ensureTools(...a) }));

import { admitStep, reservedTotal, resetGateForTests, WAIT_RECHECK_MS } from '../../../services/resources/resourceGate';
import { isInUse, resetToolUseForTests } from '../../../services/resources/toolUse';
import { createJoseRequest, getJoseRequest } from '../../../services/jose/joseRequestStore';
import type { ResourceState, LoadedThing } from '../../../services/resources/resourceState';

function state(over: Partial<ResourceState> = {}): ResourceState {
  return { atMs: Date.now(), ramTotalMb: 16384, ramFreeMb: 8000, gpuTotalMb: 8192, gpuFreeMb: 6000, gpuSource: 'nvidia', loaded: [], ...over };
}
const need = (over = {}) => ({ key: 'creative_scenes|comfy', tools: ['comfyui'], ramMb: 0, gpuMb: 3000, gpuSpillsToRam: false, learned: false, known: true, ...over });
const idleModel: LoadedThing = { kind: 'model', name: 'qwen', label: 'qwen', memMb: 4000, startedBy: 'you', lastUsedAtMs: null, inUse: false };
const publish = (s: ResourceState) => { latest = s; for (const l of [...listeners]) l(s); };
const settle = () => new Promise((r) => setTimeout(r, 0));

let requestId = '';
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  latest = null;
  listeners.clear();
  resetGateForTests();
  resetToolUseForTests();
  ensureTools.mockResolvedValue({ ok: true });
  freeThings.mockResolvedValue({ freed: ['qwen'], failed: [] });
  requestId = createJoseRequest({ commandId: 'c1', source: 'user', text: 'x', kind: 'normal', steps: [{ stepId: 'miya', agent: 'miya', actionType: 'creative_scenes', effects: [], needs: [] } as never] }).id;
});

describe('admitStep', () => {
  it('runs a step that fits, reserves its memory, marks its tools in use and releases them', async () => {
    estimateNeed.mockResolvedValue(need());
    readResources.mockResolvedValue(state());
    const result = await admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' });
    expect(result.ok).toBe(true);
    expect(ensureTools).toHaveBeenCalledWith(['comfyui']);
    expect(isInUse('comfyui')).toBe(true);
    expect(reservedTotal(Date.now())).toEqual({ ramMb: 0, gpuMb: 3000 });
    // A reading while it runs shows how much it took.
    publish(state({ gpuFreeMb: 2500 }));
    if (result.ok) result.release();
    expect(isInUse('comfyui')).toBe(false);
    expect(reservedTotal(Date.now())).toEqual({ ramMb: 0, gpuMb: 0 });
    expect(recordStepUse).toHaveBeenCalledWith('creative_scenes|comfy', { ramMb: 0, gpuMb: 3500 });
  });

  it('a step that needs nothing local runs without reading memory', async () => {
    estimateNeed.mockResolvedValue(need({ tools: [], gpuMb: 0 }));
    const result = await admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' });
    expect(result.ok).toBe(true);
    expect(readResources).not.toHaveBeenCalled();
    if (result.ok) result.release();
    expect(recordStepUse).not.toHaveBeenCalled();
  });

  it('makes room first, then runs', async () => {
    estimateNeed.mockResolvedValue(need({ gpuMb: 7000 }));
    readResources
      .mockResolvedValueOnce(state({ loaded: [idleModel] }))
      .mockResolvedValueOnce(state({ gpuFreeMb: 8000 }));
    const result = await admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' });
    expect(freeThings).toHaveBeenCalledWith([idleModel]);
    expect(result.ok).toBe(true);
  });

  it('waits with a reason on the step, then runs when memory frees', async () => {
    estimateNeed.mockResolvedValue(need({ gpuMb: 7000 }));
    const busy: LoadedThing = { kind: 'tool', name: 'comfyui', label: 'ComfyUI', memMb: 500, startedBy: 'alphonso', lastUsedAtMs: null, inUse: true };
    readResources.mockResolvedValue(state({ loaded: [busy] }));
    let done = false;
    const onWait = vi.fn();
    const pending = admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' }, undefined, onWait).then((r) => { done = true; return r; });
    await settle(); await settle(); await settle();
    expect(done).toBe(false);
    const step = getJoseRequest(requestId)!.steps[0];
    expect(step.waitingFor).toBe('Waiting for memory: ComfyUI is busy.');
    expect(typeof step.waitingSinceMs).toBe('number');
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith('Waiting for memory: ComfyUI is busy.');
    publish(state({ gpuFreeMb: 8000 }));
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(getJoseRequest(requestId)!.steps[0].waitingFor).toBeUndefined();
  });

  it('fails a step too big for this computer, saying why', async () => {
    estimateNeed.mockResolvedValue(need({ gpuMb: 12288 }));
    readResources.mockResolvedValue(state());
    expect(await admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' })).toEqual({
      ok: false, reason: 'This step needs about 12 GB of graphics memory; this computer has 8 GB.',
    });
    expect(reservedTotal(Date.now())).toEqual({ ramMb: 0, gpuMb: 0 });
  });

  it('stops while waiting for memory', async () => {
    estimateNeed.mockResolvedValue(need({ gpuMb: 7000 }));
    readResources.mockResolvedValue(state());
    const controller = new AbortController();
    const pending = admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' }, controller.signal);
    await settle(); await settle();
    controller.abort();
    expect(await pending).toEqual({ ok: false, reason: 'Stopped by you.', stopped: true });
    expect(getJoseRequest(requestId)!.steps[0].waitingFor).toBeUndefined();
  });

  it('a tool that will not start fails the step with its reason', async () => {
    estimateNeed.mockResolvedValue(need());
    readResources.mockResolvedValue(state());
    ensureTools.mockResolvedValue({ ok: false, reason: "ComfyUI didn't start. Open Runtime Hub to see its log." });
    expect(await admitStep(requestId, 'miya', { agent: 'miya', actionType: 'creative_scenes' })).toEqual({
      ok: false, reason: "ComfyUI didn't start. Open Runtime Hub to see its log.",
    });
    expect(isInUse('comfyui')).toBe(false);
    expect(reservedTotal(Date.now())).toEqual({ ramMb: 0, gpuMb: 0 });
  });

  it('rechecks on its own when no reading comes', () => {
    expect(WAIT_RECHECK_MS).toBe(30_000);
  });
});
