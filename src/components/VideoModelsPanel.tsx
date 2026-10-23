import React, { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge, Button } from './ui';
import {
  effectiveVideoModel, installVideoModel, listVideoModels, setSelectedVideoModel, type VideoModelsInfo,
} from '../services/videoModelService';

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** Runtime Hub → ComfyUI: video models for Miya's AI clips, suggested by the card (phase 2b). */
export function VideoModelsPanel() {
  const [info, setInfo] = useState<VideoModelsInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setPicked] = useState(0);
  const [progress, setProgress] = useState<{ message: string; pct: number } | null>(null);

  // The backend reports each file's download on runtime://progress as tool "comfyui-video".
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    listen<{ tool: string; message: string; pct: number }>('runtime://progress', ({ payload }) => {
      if (payload?.tool === 'comfyui-video') setProgress({ message: payload.message, pct: payload.pct });
    }).then((fn) => { if (alive) unlisten = fn; else fn(); }).catch(() => undefined);
    return () => { alive = false; unlisten?.(); };
  }, []);

  const load = useCallback(() => {
    // Never let this panel break Runtime Hub: any failure shows as its own message.
    Promise.resolve()
      .then(() => listVideoModels())
      .then((result) => { if (result && Array.isArray(result.models)) setInfo(result); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  if (!info) return error ? <p className="text-xs text-(--error)">{error}</p> : null;
  const current = effectiveVideoModel(info);

  const install = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await installVideoModel(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
      load();
    }
  };

  return (
    <section className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs" aria-label="Video models">
      <div className="font-semibold text-(--text-1)">Video models (Miya's AI clips)</div>
      <p className="text-(--text-3)">
        {info.vramGb === null
          ? 'No NVIDIA graphics card was found, so AI clips need Runway (Connectors). You can still install a model if your card is not detected.'
          : `Your card: ${Math.round(info.vramGb)} GB of video memory.`}
      </p>
      <p className="text-(--text-3)">
        {info.comfyuiDir
          ? `Installs into: ${info.comfyuiDir}${info.comfyuiDir.includes('\\') ? '\\' : '/'}models`
          : 'No ComfyUI was found. Install it above, or choose yours in Settings → Runtime → ComfyUI.'}
      </p>
      <ul className="space-y-2">
        {info.models.map((m) => (
          <li key={m.id} className="space-y-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="video-model"
                checked={current?.id === m.id}
                onChange={() => { setSelectedVideoModel(m.id === info.suggested ? null : m.id); setPicked((n) => n + 1); }}
                aria-label={m.name}
              />
              <span className="font-semibold text-(--text-1)">{m.name}</span>
              {m.id === info.suggested && <Badge variant="info">Suggested for your card</Badge>}
              {m.installed && <Badge variant="success">Installed</Badge>}
            </label>
            <div className="pl-6 text-(--text-3)">
              {`needs ${m.minVramGb} GB · ${gb(m.sizeBytes)} download · clips up to ${m.maxSeconds} s`}
            </div>
            <div className="pl-6 text-(--text-3)">{m.license}</div>
            {!m.installed && (
              <div className="pl-6">
                <Button size="sm" variant="secondary" onClick={() => { void install(m.id); }} disabled={busy !== null} loading={busy === m.id} aria-label={`Install ${m.name}`}>
                  Install
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {progress && (
        <div className="space-y-1">
          <p className="text-(--text-3)">{progress.message}</p>
          <div className="h-1.5 w-full rounded bg-(--surface-1)"><div className="h-1.5 rounded bg-(--accent)" style={{ width: `${Math.min(100, progress.pct)}%` }} /></div>
        </div>
      )}
      {error && <p className="text-(--error)">{error}</p>}
    </section>
  );
}
