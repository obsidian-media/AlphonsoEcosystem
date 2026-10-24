import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { MotionRecorder } from './MotionRecorder';
import type { SceneMotion } from '../../services/contentFactory/contentTypes';
import { listHiggsfieldPresets } from '../../services/connectors/higgsfieldConnector';

type Mode = 'none' | 'preset' | 'record' | 'file';
const field = 'rounded-lg bg-(--surface-1) px-2 py-0.5 text-[11px]';

function modeOf(motion: SceneMotion | null): Mode {
  if (!motion) return 'none';
  return motion.source === 'preset' ? 'preset' : motion.source === 'recorded' ? 'record' : 'file';
}

/** A scene's (or Short part's) motion (phase 4c): Miya's suggestion, a Higgsfield preset, a recording or a file. */
export function MotionPicker({ label, motion, suggested = false, onSet, onClip, onDismissSuggestion }: {
  label: string;
  motion: SceneMotion | null;
  suggested?: boolean;
  onSet(motion: SceneMotion | null): void;
  onClip(input: { base64: string } | { choose: true }): Promise<{ ok: boolean; path?: string; reason?: string }>;
  onDismissSuggestion?(): void;
}) {
  const [mode, setMode] = useState<Mode>(modeOf(motion));
  const [preset, setPreset] = useState(motion?.presetId || '');
  const [note, setNote] = useState('');
  // Higgsfield's own presets when its API lists them (phase 4c); otherwise a pasted id.
  const [presets, setPresets] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (mode !== 'preset' || presets) return;
    let alive = true;
    listHiggsfieldPresets().then((r) => { if (alive) setPresets(r.ok && r.presets?.length ? r.presets : []); }).catch(() => { if (alive) setPresets([]); });
    return () => { alive = false; };
  }, [mode, presets]);
  const clip = async (input: { base64: string } | { choose: true }) => {
    setNote('Saving…');
    const saved = await onClip(input);
    setNote(saved.ok ? 'Saved.' : saved.reason || '');
  };
  return (
    <div className="space-y-1 text-[11px] text-(--text-2)">
      {suggested && !motion && (
        <div className="flex items-center gap-2 text-(--text-3)">
          Miya suggests a move here.
          {onDismissSuggestion && <button type="button" className="underline" onClick={onDismissSuggestion}>Not here</button>}
        </div>
      )}
      <label className="flex items-center gap-1">
        Motion
        <select aria-label={`Motion: ${label}`} className={field} value={mode}
          onChange={(e) => { const next = e.target.value as Mode; setMode(next); setNote(''); if (next === 'none') onSet(null); }}>
          <option value="none">None (a normal clip)</option>
          <option value="preset">A Higgsfield preset</option>
          <option value="record">Record a move</option>
          <option value="file">A video from your files</option>
        </select>
      </label>
      {mode === 'preset' && (
        <div className="flex items-center gap-1">
          {presets && presets.length > 0 ? (
            <select aria-label={`Preset: ${label}`} className={field} value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="">Choose a preset…</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <input aria-label={`Preset id: ${label}`} className={field} placeholder="Preset id from Higgsfield" value={preset} onChange={(e) => setPreset(e.target.value)} />
          )}
          <Button size="sm" variant="secondary" disabled={!preset.trim()} onClick={() => { onSet({ source: 'preset', presetId: preset.trim() }); setNote('Saved.'); }}>Use this preset</Button>
        </div>
      )}
      {mode === 'record' && <MotionRecorder onKeep={(b64) => clip({ base64: b64 })} />}
      {mode === 'file' && <Button size="sm" variant="secondary" onClick={() => { void clip({ choose: true }); }}>Choose a video…</Button>}
      {motion?.path && <div className="text-(--text-3)">Using {motion.path.split('/').pop()}</div>}
      {note && <div className="text-(--text-3)">{note}</div>}
    </div>
  );
}
