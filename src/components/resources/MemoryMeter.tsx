// Resource manager (2026-10-30): the small memory meter in the top bar. RAM
// used of total, and graphics memory when it is known; a click opens Runtime
// Hub's Memory section. Nothing shows before the first reading, or outside the
// desktop app where memory can't be read.
import React, { useEffect, useState } from 'react';
import { latestResources, onResources } from '../../services/resources/idleStop';
import type { ResourceState } from '../../services/resources/resourceState';

const whole = (mb: number) => Math.round(mb / 1024);

export function MemoryMeter({ onOpen }: { onOpen: () => void }) {
  const [state, setState] = useState<ResourceState | null>(() => latestResources());
  useEffect(() => onResources((next) => setState(next)), []);
  if (!state || !state.ramTotalMb) return null;

  const ram = `RAM ${whole(state.ramTotalMb - state.ramFreeMb)}/${whole(state.ramTotalMb)} GB`;
  const gpu = state.gpuTotalMb !== null && state.gpuFreeMb !== null
    ? `GPU ${whole(state.gpuTotalMb - state.gpuFreeMb)}/${whole(state.gpuTotalMb)} GB`
    : null;

  return (
    <button
      type="button"
      data-testid="memory-meter"
      onClick={onOpen}
      title="Open the Memory section in Runtime Hub"
      className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-(--text-3) hover:text-(--text-1) hover:bg-(--surface-3) transition-colors"
    >
      <span>{ram}</span>
      {gpu && <span>{gpu}</span>}
    </button>
  );
}
