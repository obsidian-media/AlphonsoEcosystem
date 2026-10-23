import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { CONTENT_FORMATS, type ContentBrief, type ContentFormat } from '../../services/contentFactory/contentTypes';

const list = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);

/** The project's idea and what should come out of it. Every step reads this. */
export function BriefPanel({ brief, onSave }: { brief: ContentBrief; onSave(brief: ContentBrief): void }) {
  const [draft, setDraft] = useState(brief);
  const [platforms, setPlatforms] = useState(brief.platforms.join(', '));
  const [outputs, setOutputs] = useState(brief.outputs.join(', '));
  useEffect(() => {
    setDraft(brief);
    setPlatforms(brief.platforms.join(', '));
    setOutputs(brief.outputs.join(', '));
  }, [brief]);
  const field = 'mt-1 w-full rounded-xl bg-(--surface-2) px-3 py-2 text-[12px] text-(--text-1)';
  const changed = JSON.stringify({ ...draft, platforms: list(platforms), outputs: list(outputs) }) !== JSON.stringify(brief);

  return (
    <section className="rounded-2xl bg-(--surface-1) p-4 space-y-3" aria-label="Brief">
      <h3 className="text-sm font-semibold text-(--text-1)">Brief</h3>
      <label className="block text-[11px] text-(--text-3)">
        Idea
        <textarea aria-label="Idea" className={field} value={draft.idea} onChange={(e) => setDraft({ ...draft, idea: e.target.value })} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-[11px] text-(--text-3)">
          Platforms (comma separated)
          <input aria-label="Platforms" className={field} value={platforms} onChange={(e) => setPlatforms(e.target.value)} placeholder="YouTube, Instagram, TikTok" />
        </label>
        <label className="block text-[11px] text-(--text-3)">
          What to make (comma separated)
          <input aria-label="What to make" className={field} value={outputs} onChange={(e) => setOutputs(e.target.value)} placeholder="Long video, 3 Shorts, carousel" />
        </label>
        <label className="block text-[11px] text-(--text-3)">
          Format
          <select aria-label="Format" className={field} value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as ContentFormat })}>
            {CONTENT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-(--text-3)">
          Length (seconds)
          <input aria-label="Length in seconds" type="number" min={5} className={field} value={draft.lengthSec}
            onChange={(e) => setDraft({ ...draft, lengthSec: Math.max(5, Number(e.target.value) || 5) })} />
        </label>
      </div>
      <label className="block text-[11px] text-(--text-3)">
        Notes
        <textarea aria-label="Notes" className={field} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-4 text-[12px] text-(--text-2)">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.writeInMyVoice} onChange={(e) => setDraft({ ...draft, writeInMyVoice: e.target.checked })} />
          Write in my voice (uses the brand's past scripts)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.showEverything} onChange={(e) => setDraft({ ...draft, showEverything: e.target.checked })} />
          Show everything (also pieces below the quality threshold)
        </label>
      </div>
      <Button size="sm" disabled={!changed} onClick={() => onSave({ ...draft, platforms: list(platforms), outputs: list(outputs) })}>Save brief</Button>
    </section>
  );
}
