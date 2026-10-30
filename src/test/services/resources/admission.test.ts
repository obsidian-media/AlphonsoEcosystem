// Resource manager Task 4: run now, make room first, wait, or too big for this computer.
import { describe, it, expect } from 'vitest';
import { decideAdmission, memoryWaitLine, tooBigLine, MARGIN } from '../../../services/resources/admission';
import type { ResourceState, LoadedThing } from '../../../services/resources/resourceState';
import type { StepNeed } from '../../../services/resources/stepNeeds';

const NONE = { ramMb: 0, gpuMb: 0 };

function state(over: Partial<ResourceState> = {}): ResourceState {
  return { atMs: 0, ramTotalMb: 16384, ramFreeMb: 8000, gpuTotalMb: 8192, gpuFreeMb: 6000, gpuSource: 'nvidia', loaded: [], ...over };
}
function need(over: Partial<StepNeed> = {}): StepNeed {
  return { key: 'k', tools: ['comfyui'], ramMb: 0, gpuMb: 0, gpuSpillsToRam: false, learned: false, known: true, ...over };
}
function thing(over: Partial<LoadedThing>): LoadedThing {
  return { kind: 'tool', name: 'x', label: 'X', memMb: 1000, startedBy: 'alphonso', lastUsedAtMs: null, inUse: false, ...over };
}

describe('decideAdmission', () => {
  it('fits with room', () => {
    expect(decideAdmission(need({ gpuMb: 4000, ramMb: 2000 }), state(), NONE)).toEqual({ kind: 'run' });
  });

  it('keeps the safety margin free', () => {
    expect(MARGIN).toEqual({ ramMb: 1024, gpuMb: 512 });
    expect(decideAdmission(need({ gpuMb: 6000 - 512 + 1 }), state(), NONE).kind).not.toBe('run');
    expect(decideAdmission(need({ gpuMb: 6000 - 512 }), state(), NONE)).toEqual({ kind: 'run' });
  });

  it('frees idle models largest first, and only as many as needed', () => {
    const loaded = [
      thing({ kind: 'model', name: 'small', memMb: 1000, startedBy: 'you' }),
      thing({ kind: 'model', name: 'big', memMb: 3000, startedBy: 'you' }),
      thing({ kind: 'model', name: 'mid', memMb: 2000, startedBy: 'you' }),
    ];
    // Free 6000 − margin 512 = 5488 available; need 7000 → short 1512.
    const decision = decideAdmission(need({ gpuMb: 7000 }), state({ loaded }), NONE);
    expect(decision).toEqual({ kind: 'free_first', free: [loaded[1]] });
  });

  it('frees an idle tool Alphonso started for RAM', () => {
    const tool = thing({ name: 'audiocraft', label: 'AudioCraft', memMb: 4000 });
    const decision = decideAdmission(need({ tools: ['kokoro'], ramMb: 9000 }), state({ loaded: [tool] }), NONE);
    expect(decision).toEqual({ kind: 'free_first', free: [tool] });
  });

  it('never frees anything in use', () => {
    const busy = thing({ kind: 'model', name: 'busy', label: 'busy', memMb: 5000, inUse: true });
    const decision = decideAdmission(need({ gpuMb: 7000 }), state({ loaded: [busy] }), NONE);
    expect(decision).toEqual({ kind: 'wait', reason: 'Waiting for memory: busy is busy.' });
  });

  it('never stops a tool you started or the Ollama program; your idle models and your ComfyUI only unload', () => {
    const yourN8n = thing({ name: 'n8n', label: 'n8n', startedBy: 'you', memMb: null });
    const ollama = thing({ name: 'ollama', label: 'Ollama', memMb: 5000 });
    const yourModel = thing({ kind: 'model', name: 'qwen', label: 'qwen', memMb: 3000, startedBy: 'you' });
    const decision = decideAdmission(need({ gpuMb: 7000 }), state({ loaded: [yourN8n, ollama, yourModel] }), NONE);
    expect(decision).toEqual({ kind: 'free_first', free: [yourModel] });
  });

  it('tries your idle ComfyUI (size unknown) when nothing known covers the gap', () => {
    const comfy = thing({ name: 'comfyui', label: 'ComfyUI', startedBy: 'you', memMb: null });
    const decision = decideAdmission(need({ gpuMb: 7000 }), state({ loaded: [comfy] }), NONE);
    expect(decision).toEqual({ kind: 'free_first', free: [comfy] });
  });

  it('waits and names what holds memory when freeing cannot cover it', () => {
    const comfy = thing({ name: 'comfyui', label: 'ComfyUI', inUse: true, memMb: 500 });
    const decision = decideAdmission(need({ gpuMb: 7000 }), state({ loaded: [comfy] }), NONE);
    expect(decision).toEqual({ kind: 'wait', reason: 'Waiting for memory: ComfyUI is busy.' });
  });

  it('waits plainly when nothing is named', () => {
    expect(decideAdmission(need({ gpuMb: 7000 }), state(), NONE)).toEqual({ kind: 'wait', reason: 'Waiting for memory to free up.' });
  });

  it('too big for this computer', () => {
    expect(decideAdmission(need({ gpuMb: 8192 }), state({ gpuTotalMb: 4096, gpuFreeMb: 4000 }), NONE)).toEqual({
      kind: 'too_big',
      reason: 'This step needs about 8 GB of graphics memory; this computer has 4 GB.',
    });
    expect(decideAdmission(need({ ramMb: 20000 }), state(), NONE)).toEqual({
      kind: 'too_big',
      reason: 'This step needs about 19.5 GB of RAM; this computer has 16 GB.',
    });
  });

  it('an Ollama model that does not fit the card runs partly from RAM', () => {
    const decision = decideAdmission(need({ tools: ['ollama'], gpuMb: 8000, gpuSpillsToRam: true }), state({ gpuFreeMb: 4000 }), NONE);
    expect(decision).toEqual({ kind: 'run' });
    // Bigger than the card, but card plus RAM hold it: not too big.
    const big = decideAdmission(need({ tools: ['ollama'], gpuMb: 12000, gpuSpillsToRam: true }), state({ gpuFreeMb: 8000, ramFreeMb: 12000 }), NONE);
    expect(big).toEqual({ kind: 'run' });
  });

  it('unknown graphics memory decides on RAM (an Ollama model then runs from RAM)', () => {
    const unknown = { gpuTotalMb: null, gpuFreeMb: null, gpuSource: 'unknown' as const };
    expect(decideAdmission(need({ gpuMb: 50000 }), state(unknown), NONE)).toEqual({ kind: 'run' });
    expect(decideAdmission(need({ tools: ['ollama'], gpuMb: 9000, gpuSpillsToRam: true }), state(unknown), NONE).kind).not.toBe('run');
    expect(decideAdmission(need({ tools: ['ollama'], gpuMb: 6000, gpuSpillsToRam: true }), state(unknown), NONE)).toEqual({ kind: 'run' });
  });

  it('counts reservations not yet measured', () => {
    expect(decideAdmission(need({ gpuMb: 3000 }), state(), { ramMb: 0, gpuMb: 3000 }).kind).not.toBe('run');
    expect(decideAdmission(need({ gpuMb: 3000 }), state(), { ramMb: 0, gpuMb: 2000 })).toEqual({ kind: 'run' });
  });

  it('a computer it could not measure never holds anything back', () => {
    expect(decideAdmission(need({ ramMb: 99999 }), state({ ramTotalMb: 0, ramFreeMb: 0 }), NONE)).toEqual({ kind: 'run' });
  });
});

describe('lines', () => {
  it('names one or several holders', () => {
    expect(memoryWaitLine([])).toBe('Waiting for memory to free up.');
    expect(memoryWaitLine(['ComfyUI'])).toBe('Waiting for memory: ComfyUI is busy.');
    expect(memoryWaitLine(['ComfyUI', 'qwen'])).toBe('Waiting for memory: ComfyUI and qwen are busy.');
    expect(memoryWaitLine(['A', 'B', 'C'])).toBe('Waiting for memory: A, B and C are busy.');
  });

  it('rounds to one decimal and drops .0', () => {
    expect(tooBigLine('graphics memory', 8192, 4096)).toBe('This step needs about 8 GB of graphics memory; this computer has 4 GB.');
    expect(tooBigLine('RAM', 6656, 3584)).toBe('This step needs about 6.5 GB of RAM; this computer has 3.5 GB.');
  });
});
