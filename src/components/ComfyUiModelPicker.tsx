import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  getSelectedComfyUiCheckpoint,
  listComfyUiCheckpoints,
  pickAutomaticCheckpoint,
  setSelectedComfyUiCheckpoint
} from '../services/connectors/connectorImageGenerators.js';

/**
 * Choose which image model (ComfyUI checkpoint) the agents use, the way the
 * chat model is chosen (owner request, 2026-10-22). Lists what ComfyUI really
 * has; "Automatic" uses the starter model when present.
 */
export function ComfyUiModelPicker() {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(getSelectedComfyUiCheckpoint());
  const [state, setState] = useState<'loading' | 'ok' | 'offline'>('loading');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setState('loading');
    const result = await listComfyUiCheckpoints();
    setModels(result.models || []);
    setError(result.error || '');
    setState(result.ok ? 'ok' : 'offline');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const choose = (value: string) => {
    setSelected(value);
    setSelectedComfyUiCheckpoint(value);
  };

  const automatic = pickAutomaticCheckpoint(models);
  const missing = selected && state === 'ok' && !models.includes(selected);

  return (
    <div className="space-y-1.5" data-testid="comfyui-model-picker">
      <div className="flex items-center justify-between">
        <label htmlFor="comfyui-model" className="text-xs font-semibold text-(--text-2)">Image model</label>
        <button
          onClick={() => void refresh()}
          aria-label="Refresh image models"
          className="inline-flex items-center gap-1 text-[11px] text-(--text-3) hover:text-(--text-1)"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {state === 'loading' && <div className="text-[11px] text-(--text-4)">Checking ComfyUI…</div>}
      {state === 'offline' && (
        <div className="text-[11px] text-(--text-3)">
          ComfyUI isn't running, so its models can't be listed. Start it, then Refresh.{error ? ` (${error})` : ''}
        </div>
      )}
      {state === 'ok' && models.length === 0 && (
        <div className="text-[11px] text-(--text-3)">
          ComfyUI has no image models yet. Put a model file in ComfyUI's <span className="font-mono">models/checkpoints</span> folder, then Refresh.
        </div>
      )}
      {state === 'ok' && models.length > 0 && (
        <select
          id="comfyui-model"
          value={missing ? '' : selected}
          onChange={(e) => choose(e.target.value)}
          className="w-full bg-(--surface-2) rounded-xl px-3 py-2 text-sm text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
        >
          <option value="">Automatic ({automatic})</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      {missing && (
        <div className="text-[11px] text-(--warning)">
          Your chosen model "{selected}" isn't in ComfyUI any more; Automatic is used until you pick another.
        </div>
      )}
      <div className="text-[11px] text-(--text-4)">Used by Miya Studio, Content Studio and image requests in chat.</div>
    </div>
  );
}
