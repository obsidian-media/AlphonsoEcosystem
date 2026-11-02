import React, { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge, Button } from './ui';
import { installPictureModel, listPictureModels, type ExtraModelInfo } from '../services/videoModelService';
import { getSelectedComfyUiCheckpoint, setSelectedComfyUiCheckpoint } from '../services/connectors/connectorImageGenerators';

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
const checkpointOf = (m: ExtraModelInfo) => m.fileNames?.[0] || '';

/** Runtime Hub → ComfyUI: picture models better than the starter one (owner, 2026-11-02). An
 *  installed one is used for every picture ComfyUI makes; Settings → Runtime → ComfyUI can change it. */
export function PictureModelsPanel() {
  const [models, setModels] = useState<ExtraModelInfo[] | null>(null);
  const [chosen, setChosen] = useState(() => getSelectedComfyUiCheckpoint());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ message: string; pct: number } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    listen<{ tool: string; message: string; pct: number }>('runtime://progress', ({ payload }) => {
      if (payload?.tool === 'comfyui-picture') setProgress({ message: payload.message, pct: payload.pct });
    }).then((fn) => { if (alive) unlisten = fn; else fn(); }).catch(() => undefined);
    return () => { alive = false; unlisten?.(); };
  }, []);

  const load = useCallback(() => {
    // An older backend has no such command: nothing to show.
    Promise.resolve().then(() => listPictureModels()).then((list) => setModels(Array.isArray(list) ? list : [])).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const choose = (m: ExtraModelInfo) => {
    setSelectedComfyUiCheckpoint(checkpointOf(m));
    setChosen(checkpointOf(m));
  };

  const install = async (m: ExtraModelInfo) => {
    setBusy(m.id);
    setError(null);
    try {
      await installPictureModel(m.id);
      choose(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
      load();
    }
  };

  if (!models || models.length === 0) return error ? <p className="text-xs text-(--error)">{error}</p> : null;

  return (
    <section className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs" aria-label="Picture models">
      <div className="font-semibold text-(--text-1)">Picture models (Miya's pictures, free)</div>
      <p className="text-(--text-3)">Sharper, more detailed pictures than the starter model, drawn at 1024 pixels. The one you install is used for every picture; change it in Settings → Runtime → ComfyUI.</p>
      {models.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-2">
          <span className="text-(--text-1)">{m.name}</span>
          <span className="text-(--text-3)">{gb(m.sizeBytes)} · needs about {m.minVramGb} GB of graphics memory · {m.license}</span>
          {m.installed && chosen === checkpointOf(m) && <span data-testid={`picture-model-in-use-${m.id}`}><Badge>Used for pictures</Badge></span>}
          {m.installed && chosen !== checkpointOf(m) && (
            <Button size="sm" data-testid={`picture-model-use-${m.id}`} onClick={() => choose(m)}>Use for pictures</Button>
          )}
          {!m.installed && (
            <Button size="sm" data-testid={`picture-model-install-${m.id}`} disabled={busy !== null} onClick={() => { void install(m); }}>
              {busy === m.id ? 'Installing…' : 'Install'}
            </Button>
          )}
        </div>
      ))}
      {progress && <p className="text-(--text-3)">{progress.message} ({progress.pct}%)</p>}
      {error && <p className="text-(--error)">{error}</p>}
    </section>
  );
}
