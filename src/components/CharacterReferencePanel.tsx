import React, { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge, Button } from './ui';
import { getCharacterReferenceModel, installCharacterReferenceModel, type ExtraModelInfo } from '../services/videoModelService';

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** Runtime Hub → ComfyUI: the model that keeps a brand's character free on this computer (phase 4c). */
export function CharacterReferencePanel() {
  const [info, setInfo] = useState<ExtraModelInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ message: string; pct: number } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    listen<{ tool: string; message: string; pct: number }>('runtime://progress', ({ payload }) => {
      if (payload?.tool === 'comfyui-reference') setProgress({ message: payload.message, pct: payload.pct });
    }).then((fn) => { if (alive) unlisten = fn; else fn(); }).catch(() => undefined);
    return () => { alive = false; unlisten?.(); };
  }, []);

  const load = useCallback(() => {
    Promise.resolve()
      .then(() => getCharacterReferenceModel())
      .then((result) => { if (result) setInfo(result); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  if (!info) return error ? <p className="text-xs text-(--error)">{error}</p> : null;

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      await installCharacterReferenceModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
      load();
    }
  };

  return (
    <section className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs" aria-label="Character reference model">
      <div className="font-semibold text-(--text-1)">Characters (Miya's brand characters, free)</div>
      <p className="text-(--text-3)">Keeps a brand's character the same in every picture made with ComfyUI, from its reference pictures. Higgsfield is the paid, more exact option.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-(--text-1)">{info.name}</span>
        <span className="text-(--text-3)">{gb(info.sizeBytes)} · needs about {info.minVramGb} GB of graphics memory · {info.license}</span>
        {info.installed ? <Badge>Installed</Badge> : <Button size="sm" disabled={busy} onClick={() => { void install(); }}>{busy ? 'Installing…' : 'Install'}</Button>}
      </div>
      {progress && <p className="text-(--text-3)">{progress.message} ({progress.pct}%)</p>}
      {error && <p className="text-(--error)">{error}</p>}
    </section>
  );
}
