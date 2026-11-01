import React, { useState } from 'react';
import type { StudioData } from '../../services/phone/remoteData';

const MAKE: Array<{ id: 'video' | 'shorts' | 'carousel'; label: string }> = [
  { id: 'video', label: 'Video' }, { id: 'shorts', label: 'Shorts' }, { id: 'carousel', label: 'Carousel' },
];

/** Start a Miya Studio project from the phone: the idea, the brand and what to make (the rest from the brand). */
export function NewProject({ studio, onDone }: { studio: StudioData; onDone: (message: string) => void }) {
  const brands = studio.brands();
  const [idea, setIdea] = useState('');
  const [brandId, setBrandId] = useState(brands[0]?.id || '');
  const [make, setMake] = useState<Set<string>>(new Set(['video']));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async () => {
    setBusy(true);
    const r = await studio.call('content.startProject', { brandId, idea: idea.trim(), make: MAKE.map((m) => m.id).filter((id) => make.has(id)) });
    setBusy(false);
    if (r.ok === false) { setMessage(r.reason); return; }
    onDone('Started. Jose runs it and stops after the review for your approval.');
  };

  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="studio-new-project">
      <textarea aria-label="Idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="What is the video about?" className="w-full rounded-lg border border-(--border) px-3 py-2" />
      {brands.length === 0
        ? <p className="text-xs text-(--text-3)">Add a brand in Miya Studio on your computer first.</p>
        : (
          <select aria-label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full rounded-lg border border-(--border) px-3 py-2">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      <fieldset className="flex gap-4">
        <legend className="mb-1 text-xs text-(--text-3)">What to make</legend>
        {MAKE.map((m) => (
          <label key={m.id} className="flex items-center gap-1">
            <input type="checkbox" checked={make.has(m.id)} onChange={(e) => { const next = new Set(make); if (e.target.checked) next.add(m.id); else next.delete(m.id); setMake(next); }} />
            {m.label}
          </label>
        ))}
      </fieldset>
      {message && <p role="status" className="text-xs">{message}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || studio.readOnly || !idea.trim() || !brandId || make.size === 0} onClick={run} className="rounded-lg bg-(--accent) px-4 py-2 text-white">Run project</button>
        <button type="button" onClick={() => onDone('')} className="rounded-lg bg-(--surface-3) px-4 py-2">Cancel</button>
      </div>
    </div>
  );
}
