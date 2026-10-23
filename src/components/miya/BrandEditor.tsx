import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { listBrands, saveBrand } from '../../services/contentFactory/contentBrandService';
import type { ContentBrand } from '../../services/contentFactory/contentTypes';

const lines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

function referencesToText(refs: ContentBrand['references']): string {
  return refs.map((r) => (r.note ? `${r.url} | ${r.note}` : r.url)).join('\n');
}

function textToReferences(text: string): ContentBrand['references'] {
  return lines(text).map((line) => {
    const [url, ...note] = line.split('|');
    return { url: url.trim(), note: note.join('|').trim() };
  });
}

/** One brand kit per channel or client: what every step of a project follows. */
export function BrandEditor({ brandId, onBrand }: { brandId: string; onBrand(id: string): void }) {
  const [brands, setBrands] = useState(listBrands);
  const brand = brands.find((b) => b.id === brandId) || brands[0];
  const [draft, setDraft] = useState<ContentBrand | null>(brand || null);
  const [refs, setRefs] = useState(referencesToText(brand?.references || []));
  const [saved, setSaved] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    setDraft(brand || null);
    setRefs(referencesToText(brand?.references || []));
    setSaved('');
  }, [brand?.id]);  

  if (!draft) return null;
  const field = 'mt-1 w-full rounded-xl bg-(--surface-2) px-3 py-2 text-[12px] text-(--text-1)';
  const text = (key: keyof ContentBrand, label: string, area = false) => (
    <label className="block text-[11px] text-(--text-3)">
      {label}
      {area ? (
        <textarea aria-label={label} className={field} value={String(draft[key] ?? '')} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      ) : (
        <input aria-label={label} className={field} value={String(draft[key] ?? '')} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      )}
    </label>
  );

  const save = () => {
    const next = saveBrand({ ...draft, references: textToReferences(refs) });
    setBrands(listBrands());
    setDraft(next);
    setSaved('Saved');
  };

  return (
    <section className="space-y-4" aria-label="Brands">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Brands</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-(--text-3)">
          Brand
          <select aria-label="Brand to edit" className="mt-1 block rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)" value={draft.id} onChange={(e) => onBrand(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-(--text-3)">
          New brand
          <input aria-label="New brand name" className="mt-1 block rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Channel or client" />
        </label>
        <Button size="sm" disabled={!newName.trim()} onClick={() => { const b = saveBrand({ name: newName.trim() }); setBrands(listBrands()); setNewName(''); onBrand(b.id); }}>Add brand</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {text('name', 'Name')}
        {text('tone', 'Tone of voice')}
        {text('audience', 'Audience')}
        {text('visualStyle', 'Visual style')}
        {text('characterRefs', 'Characters or mascots')}
        {text('fonts', 'Fonts')}
        <label className="block text-[11px] text-(--text-3)">
          Colours (comma separated, e.g. #0C6944, #F5F0E8)
          <input aria-label="Colours" className={field} value={draft.palette.join(', ')}
            onChange={(e) => setDraft({ ...draft, palette: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })} />
        </label>
        <label className="block text-[11px] text-(--text-3)">
          Platforms (comma separated)
          <input aria-label="Brand platforms" className={field} value={draft.platforms.join(', ')}
            onChange={(e) => setDraft({ ...draft, platforms: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })} />
        </label>
        {text('schedule', 'Posting schedule (e.g. Tuesdays and Fridays at 6 pm)')}
        <label className="block text-[11px] text-(--text-3)">
          Quality threshold (1–10)
          <input aria-label="Quality threshold" type="number" min={1} max={10} className={field} value={draft.qualityThreshold}
            onChange={(e) => setDraft({ ...draft, qualityThreshold: Math.min(10, Math.max(1, Number(e.target.value) || 7)) })} />
        </label>
      </div>
      {text('honestyRules', 'Brand rules (what may and may not be said)', true)}
      <label className="block text-[11px] text-(--text-3)">
        Reference posts (one per line: link | why it is good)
        <textarea aria-label="Reference posts" className={field} rows={4} value={refs} onChange={(e) => setRefs(e.target.value)} />
      </label>
      {text('pastScripts', 'Past scripts (for “write in my voice”)', true)}
      <div className="text-[11px] text-(--text-3)">Voice: Kokoro ({draft.voice.voiceId}), free and local.</div>

      {draft.lessons.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Lessons from your feedback</div>
          <ul className="list-disc pl-4 text-[12px] text-(--text-2)">{draft.lessons.slice(-20).map((l) => <li key={`${l.atMs}-${l.text}`}>{l.text}</li>)}</ul>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save}>Save brand</Button>
        {saved && <span className="text-[12px] text-(--success)">{saved}</span>}
      </div>
    </section>
  );
}
