import React, { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Badge, Button } from './ui';
import {
  getCharacterReferenceModel, getLocalMotionModel, installCharacterReferenceModel, installLocalMotionModel, type ExtraModelInfo,
} from '../services/videoModelService';
import { MOTION_CARD_TOO_SMALL } from '../services/contentFactory/comfyMotionClip';

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** One extra ComfyUI model on Runtime Hub's ComfyUI card (phase 4c): its size, memory, licence and Install. */
function ExtraModelPanel({ label, title, blurb, tool, load: loadInfo, install: installModel, tooSmall }: {
  label: string;
  title: string;
  blurb: string;
  tool: string;
  load(): Promise<ExtraModelInfo>;
  install(): Promise<void>;
  /** Said instead of Install when the card has less memory than the model needs. */
  tooSmall?: string;
}) {
  const [info, setInfo] = useState<ExtraModelInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ message: string; pct: number } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    listen<{ tool: string; message: string; pct: number }>('runtime://progress', ({ payload }) => {
      if (payload?.tool === tool) setProgress({ message: payload.message, pct: payload.pct });
    }).then((fn) => { if (alive) unlisten = fn; else fn(); }).catch(() => undefined);
    return () => { alive = false; unlisten?.(); };
  }, [tool]);

  const load = useCallback(() => {
    Promise.resolve()
      .then(() => loadInfo())
      .then((result) => { if (result) setInfo(result); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [loadInfo]);
  useEffect(load, [load]);

  if (!info) return error ? <p className="text-xs text-(--error)">{error}</p> : null;

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      await installModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
      load();
    }
  };
  const cardTooSmall = Boolean(tooSmall) && !info.installed && (info.vramGb === null || info.vramGb < info.minVramGb);

  return (
    <section className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs" aria-label={label}>
      <div className="font-semibold text-(--text-1)">{title}</div>
      <p className="text-(--text-3)">{blurb}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-(--text-1)">{info.name}</span>
        <span className="text-(--text-3)">{gb(info.sizeBytes)} · needs about {info.minVramGb} GB of graphics memory · {info.license}</span>
        {info.installed
          ? <Badge>Installed</Badge>
          : cardTooSmall
            ? <span className="text-(--text-2)">{tooSmall}</span>
            : <Button size="sm" disabled={busy} onClick={() => { void install(); }}>{busy ? 'Installing…' : 'Install'}</Button>}
      </div>
      {progress && <p className="text-(--text-3)">{progress.message} ({progress.pct}%)</p>}
      {error && <p className="text-(--error)">{error}</p>}
    </section>
  );
}

/** Runtime Hub → ComfyUI: the model that keeps a brand's character free on this computer (phase 4c). */
export function CharacterReferencePanel() {
  return (
    <ExtraModelPanel
      label="Character reference model"
      title="Characters (Miya's brand characters, free)"
      blurb="Keeps a brand's character the same in every picture made with ComfyUI, from its reference pictures. Higgsfield is the paid, more exact option."
      tool="comfyui-reference"
      load={getCharacterReferenceModel}
      install={installCharacterReferenceModel}
    />
  );
}

/** Runtime Hub → ComfyUI: copying a recorded or chosen motion onto a scene, free on this computer (phase 4c). */
export function MotionTransferPanel() {
  return (
    <ExtraModelPanel
      label="Motion transfer model"
      title="Motion transfer (Miya's scenes and Shorts, free)"
      blurb="Moves a scene's picture like a clip you recorded or chose, on this computer. Higgsfield's presets and motion clips are the paid option."
      tool="comfyui-motion"
      load={getLocalMotionModel}
      install={installLocalMotionModel}
      tooSmall={MOTION_CARD_TOO_SMALL}
    />
  );
}
