import React, { useEffect, useState } from 'react';
import { listElevenLabsModels, listElevenLabsVoices, type ElevenLabsModel, type ElevenLabsVoice } from '../../services/connectors/elevenLabsConnector';
import type { ContentBrand } from '../../services/contentFactory/contentTypes';

type Engines = NonNullable<ContentBrand['engines']>;

/** A brand's voice, picture and AI clip engines (phase 4b); paid ones are always an extra choice. */
export function BrandEnginesEditor({ brand, onChange }: { brand: ContentBrand; onChange(engines: Engines): void }) {
  const engines = brand.engines || {};
  const voice = engines.voice || { engine: 'kokoro' as const, voiceId: brand.voice?.voiceId || 'af_heart' };
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [models, setModels] = useState<ElevenLabsModel[]>([]);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (voice.engine !== 'elevenlabs') return;
    let alive = true;
    void (async () => {
      const [v, m] = await Promise.all([listElevenLabsVoices(), listElevenLabsModels()]);
      if (!alive) return;
      setVoices(v.voices || []);
      setModels(m.models || []);
      setProblem(v.ok ? '' : v.reason || 'ElevenLabs could not be reached.');
    })();
    return () => { alive = false; };
  }, [voice.engine]);
  const field = 'rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)';
  const set = (patch: Partial<Engines>) => onChange({ ...engines, ...patch });
  return (
    <div className="space-y-2" aria-label="Engines">
      <label className="block text-[11px] text-(--text-3)">
        Voice engine
        <select aria-label="Voice engine" className={`${field} ml-2`} value={voice.engine}
          onChange={(e) => set({ voice: e.target.value === 'elevenlabs'
            ? { engine: 'elevenlabs', voiceId: engines.voice?.engine === 'elevenlabs' ? engines.voice.voiceId : '' }
            : { engine: 'kokoro', voiceId: brand.voice?.voiceId || 'af_heart' } })}>
          <option value="kokoro">Kokoro ({brand.voice?.voiceId || 'af_heart'}), free and local</option>
          <option value="elevenlabs">ElevenLabs (paid, asks first)</option>
        </select>
      </label>
      {voice.engine === 'elevenlabs' && (
        <div className="flex flex-wrap gap-2">
          <select aria-label="ElevenLabs voice" className={field} value={voice.voiceId} onChange={(e) => set({ voice: { ...voice, voiceId: e.target.value } })}>
            <option value="">Choose a voice…</option>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.cloned ? `${v.name} (your clone)` : v.name}</option>)}
          </select>
          <select aria-label="ElevenLabs model" className={field} value={voice.modelId || ''} onChange={(e) => set({ voice: { ...voice, ...(e.target.value ? { modelId: e.target.value } : { modelId: undefined }) } })}>
            <option value="">ElevenLabs' default model</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
          </select>
          {problem && <span className="text-[11px] text-(--warning)">{problem}</span>}
        </div>
      )}
      <label className="block text-[11px] text-(--text-3)">
        Pictures made by
        <select aria-label="Pictures made by" className={`${field} ml-2`} value={engines.pictures || 'comfyui'} onChange={(e) => set({ pictures: e.target.value as Engines['pictures'] })}>
          <option value="comfyui">ComfyUI (free, on this computer)</option>
          <option value="higgsfield">Higgsfield (paid, asks first with its estimate)</option>
        </select>
      </label>
      <label className="block text-[11px] text-(--text-3)">
        AI clips made by
        <select aria-label="AI clips made by" className={`${field} ml-2`} value={engines.clips || ''} onChange={(e) => set({ clips: (e.target.value || null) as Engines['clips'] })}>
          <option value="">Automatic (this computer, else Runway)</option>
          <option value="local">This computer (free)</option>
          <option value="runway">Runway (paid)</option>
          <option value="higgsfield">Higgsfield (paid)</option>
        </select>
      </label>
    </div>
  );
}
