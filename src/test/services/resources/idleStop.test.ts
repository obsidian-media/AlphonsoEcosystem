// Resource manager Task 6: stopping a tool Alphonso started once it has been idle past its time.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const stopTool = vi.fn();
vi.mock('../../../services/runtimeManagerService', () => ({ stopTool: (...a: unknown[]) => stopTool(...a) }));
const readResources = vi.fn();
vi.mock('../../../services/resources/resourceState', () => ({ readResources: (...a: unknown[]) => readResources(...a) }));

import {
  DEFAULT_IDLE_MINUTES, getIdleMinutes, setIdleMinutes, idleTick, startResourceWatcher, latestResources, onResources,
  resetIdleStopForTests, FAST_POLL_MS, SLOW_POLL_MS,
} from '../../../services/resources/idleStop';
import { beginUse, endUse, markUsed, resetToolUseForTests } from '../../../services/resources/toolUse';
import type { ResourceState, LoadedThing } from '../../../services/resources/resourceState';

const MIN = 60_000;
function thing(over: Partial<LoadedThing>): LoadedThing {
  return { kind: 'tool', name: 'comfyui', label: 'ComfyUI', memMb: 1000, startedBy: 'alphonso', lastUsedAtMs: null, inUse: false, ...over };
}
function state(loaded: LoadedThing[]): ResourceState {
  return { atMs: 0, ramTotalMb: 16000, ramFreeMb: 8000, gpuTotalMb: null, gpuFreeMb: null, gpuSource: 'unknown', loaded };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resetToolUseForTests();
  resetIdleStopForTests();
  stopTool.mockResolvedValue({ ok: true });
});

describe('idle times', () => {
  it('ComfyUI 15 minutes by default; anything else Never', () => {
    expect(DEFAULT_IDLE_MINUTES).toEqual({ comfyui: 15 });
    expect(getIdleMinutes('comfyui')).toBe(15);
    expect(getIdleMinutes('voice-os')).toBeNull();
  });

  it('are changed per tool, Never included, and bad values ignored', () => {
    setIdleMinutes('comfyui', 30);
    expect(getIdleMinutes('comfyui')).toBe(30);
    setIdleMinutes('comfyui', null);
    expect(getIdleMinutes('comfyui')).toBeNull();
    setIdleMinutes('n8n', 5);
    expect(getIdleMinutes('n8n')).toBe(5);
    localStorage.setItem('alphonso_tool_idle_v1', JSON.stringify({ comfyui: -3 }));
    expect(getIdleMinutes('comfyui')).toBe(15);
  });
});

describe('idleTick', () => {
  it('stops an Alphonso ComfyUI idle 16 minutes, keeps one idle 14', async () => {
    markUsed('comfyui', 0);
    expect(await idleTick(state([thing({})]), 14 * MIN)).toEqual([]);
    expect(await idleTick(state([thing({})]), 16 * MIN)).toEqual(['comfyui']);
    expect(stopTool).toHaveBeenCalledWith('comfyui');
  });

  it('a tool never used counts from when it was first seen running', async () => {
    expect(await idleTick(state([thing({})]), 100 * MIN)).toEqual([]);
    expect(await idleTick(state([thing({})]), 116 * MIN)).toEqual(['comfyui']);
  });

  it('never stops a tool you started, Ollama, a tool in use, or one set to Never', async () => {
    markUsed('comfyui', 0);
    markUsed('ollama', 0);
    setIdleMinutes('ollama', 1);
    expect(await idleTick(state([thing({ startedBy: 'you' })]), 99 * MIN)).toEqual([]);
    expect(await idleTick(state([thing({ name: 'ollama', label: 'Ollama' })]), 99 * MIN)).toEqual([]);
    beginUse('comfyui', 's1', 0);
    expect(await idleTick(state([thing({})]), 99 * MIN)).toEqual([]);
    endUse('comfyui', 's1', 0);
    setIdleMinutes('comfyui', null);
    expect(await idleTick(state([thing({})]), 99 * MIN)).toEqual([]);
    expect(stopTool).not.toHaveBeenCalled();
  });

  it('a stop that fails is not reported as stopped', async () => {
    markUsed('comfyui', 0);
    stopTool.mockResolvedValueOnce({ ok: false });
    expect(await idleTick(state([thing({})]), 16 * MIN)).toEqual([]);
  });
});

describe('startResourceWatcher', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads every 3 s while something is in use, else every 30 s, and publishes each reading', async () => {
    expect([FAST_POLL_MS, SLOW_POLL_MS]).toEqual([3000, 30000]);
    readResources.mockResolvedValue(state([]));
    const seen: ResourceState[] = [];
    const off = onResources((s) => seen.push(s));
    const stop = startResourceWatcher();
    await vi.advanceTimersByTimeAsync(0);
    expect(readResources).toHaveBeenCalledTimes(1);
    expect(latestResources()).toEqual(state([]));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(readResources).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(readResources).toHaveBeenCalledTimes(2);
    beginUse('comfyui', 's1', Date.now());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readResources).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(readResources).toHaveBeenCalledTimes(4);
    stop();
    off();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(readResources).toHaveBeenCalledTimes(4);
    expect(seen.length).toBe(4);
  });

  it('starting it twice runs one watcher', async () => {
    readResources.mockResolvedValue(state([]));
    const a = startResourceWatcher();
    const b = startResourceWatcher();
    await vi.advanceTimersByTimeAsync(0);
    expect(readResources).toHaveBeenCalledTimes(1);
    a();
    b();
  });
});
