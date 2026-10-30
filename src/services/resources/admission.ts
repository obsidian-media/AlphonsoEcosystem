// Resource manager (2026-10-30): whether a step runs now, makes room first,
// waits, or is too big for this computer. Pure: no reading, no freeing.
//
// Free memory for a decision = measured free − reservations not yet visible in
// the measurement − a safety margin for the OS. An Ollama model that doesn't
// fit on the card runs the rest from RAM, so its overflow is counted as RAM.
// With graphics memory unknown, RAM decides (an Ollama model then counts as
// RAM). Making room never touches anything in use, never stops the Ollama
// program or a tool you started; your idle models and your ComfyUI may only
// unload (design §5).
import type { LoadedThing, ResourceState } from './resourceState';
import type { StepNeed } from './stepNeeds';

export const MARGIN = { ramMb: 1024, gpuMb: 512 } as const;

export type Admission =
  | { kind: 'run' }
  | { kind: 'free_first'; free: LoadedThing[] }
  | { kind: 'wait'; reason: string }
  | { kind: 'too_big'; reason: string };

function gb(mb: number): string {
  return String(Math.round((mb / 1024) * 10) / 10);
}

export function tooBigLine(kind: 'RAM' | 'graphics memory', needMb: number, haveMb: number): string {
  return `This step needs about ${gb(needMb)} GB of ${kind}; this computer has ${gb(haveMb)} GB.`;
}

export function memoryWaitLine(holders: string[]): string {
  if (!holders.length) return 'Waiting for memory to free up.';
  if (holders.length === 1) return `Waiting for memory: ${holders[0]} is busy.`;
  const list = `${holders.slice(0, -1).join(', ')} and ${holders[holders.length - 1]}`;
  return `Waiting for memory: ${list} are busy.`;
}

/** Things that may be freed for this step, with what freeing each gives back. */
function candidates(state: ResourceState): LoadedThing[] {
  return state.loaded.filter((t) => {
    if (t.inUse) return false;
    if (t.kind === 'model') return true;
    if (t.name === 'ollama') return false;
    return t.startedBy === 'alphonso' || t.name === 'comfyui';
  });
}

export function decideAdmission(need: StepNeed, state: ResourceState, reservedMb: { ramMb: number; gpuMb: number }): Admission {
  // A computer that couldn't be measured never holds anything back.
  if (!(state.ramTotalMb > 0)) return { kind: 'run' };
  const gpuKnown = state.gpuTotalMb !== null && state.gpuFreeMb !== null;

  // Too big for this computer, whatever is freed.
  if (need.gpuSpillsToRam) {
    const room = state.ramTotalMb + (gpuKnown ? state.gpuTotalMb! : 0);
    if (need.ramMb + need.gpuMb > room) return { kind: 'too_big', reason: tooBigLine('RAM', need.ramMb + need.gpuMb, room) };
  } else {
    if (need.ramMb > state.ramTotalMb) return { kind: 'too_big', reason: tooBigLine('RAM', need.ramMb, state.ramTotalMb) };
    if (gpuKnown && need.gpuMb > state.gpuTotalMb!) {
      return { kind: 'too_big', reason: tooBigLine('graphics memory', need.gpuMb, state.gpuTotalMb!) };
    }
  }

  const shortBy = (freedRam: number, freedGpu: number): { ram: number; gpu: number } => {
    let gpuShort = 0;
    let ramExtra = 0;
    if (gpuKnown) {
      const gpuAvail = state.gpuFreeMb! - reservedMb.gpuMb - MARGIN.gpuMb + freedGpu;
      const over = Math.max(0, need.gpuMb - gpuAvail);
      if (need.gpuSpillsToRam) ramExtra = over;
      else gpuShort = over;
    } else if (need.gpuSpillsToRam) {
      ramExtra = need.gpuMb;
    }
    const ramAvail = state.ramFreeMb - reservedMb.ramMb - MARGIN.ramMb + freedRam;
    return { ram: Math.max(0, need.ramMb + ramExtra - ramAvail), gpu: gpuShort };
  };

  const start = shortBy(0, 0);
  if (start.ram === 0 && start.gpu === 0) return { kind: 'run' };

  // Make room: largest known first, only as many as needed.
  const pool = candidates(state);
  const known = pool.filter((t) => t.memMb !== null).sort((a, b) => (b.memMb ?? 0) - (a.memMb ?? 0));
  const unknown = pool.filter((t) => t.memMb === null);
  const picked: LoadedThing[] = [];
  let freedRam = 0;
  let freedGpu = 0;
  for (const thing of known) {
    const left = shortBy(freedRam, freedGpu);
    if (left.ram === 0 && left.gpu === 0) break;
    const mb = thing.memMb ?? 0;
    // A model frees graphics memory when it is known; a tool's measured memory is RAM.
    const credit = thing.kind === 'model' && gpuKnown ? 'gpu' : 'ram';
    const helps = credit === 'gpu' ? left.gpu > 0 || need.gpuSpillsToRam : left.ram > 0;
    if (!helps) continue;
    picked.push(thing);
    if (credit === 'gpu') freedGpu += mb;
    else freedRam += mb;
  }
  const left = shortBy(freedRam, freedGpu);
  if (left.ram === 0 && left.gpu === 0) return { kind: 'free_first', free: picked };
  // Sizes not known (your ComfyUI): try freeing them; the caller reads again and decides again.
  if (unknown.length) return { kind: 'free_first', free: [...picked, ...unknown] };

  const holders = state.loaded
    .filter((t) => t.inUse || (t.kind === 'tool' && t.startedBy === 'you' && t.name !== 'ollama'))
    .map((t) => t.label);
  return { kind: 'wait', reason: memoryWaitLine(holders) };
}
