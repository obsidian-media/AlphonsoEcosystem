// A plain warning when the chosen local model is too small for planning and code (QA batch 1,
// owner 2026-10-28): with qwen3:0.6b Jose copied his example plan and Alphonso gave no usable
// change. It blocks nothing. The size is read from the model's name ("qwen3:0.6b" → 0.6 billion);
// a name without a size gets no warning.
import React from 'react';
import { modelSize } from '../services/jose/joseModels';

/** Below this many billion parameters plans and code fail too often. */
export const SMALL_MODEL_MIN_B = 3;

export const SMALL_MODEL_NOTE = (model: string) =>
  `${model} is very small: plans and code may fail. A 3B or larger model works better (the tests use qwen2.5:7b).`;

export function isSmallModel(model: string | null | undefined): boolean {
  const size = modelSize(String(model || ''));
  return size !== null && size < SMALL_MODEL_MIN_B;
}

export function SmallModelNotice({ model, short = false }: { model: string | null | undefined; short?: boolean }) {
  const name = String(model || '').trim();
  if (!isSmallModel(name)) return null;
  const note = SMALL_MODEL_NOTE(name);
  if (short) {
    return (
      <span data-testid="small-model-notice" title={note} className="text-2xs font-semibold text-(--warning) whitespace-nowrap">
        Very small model
      </span>
    );
  }
  return (
    <div data-testid="small-model-notice" className="rounded-xl bg-(--warning-dim) p-3 text-xs text-(--warning)">
      {note}
    </div>
  );
}
