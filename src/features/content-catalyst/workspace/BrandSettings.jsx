import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_BRAND_PROFILE } from '../state/contentCatalystState';

function normalizePillars(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', description = '', example_topics = ''] = line.split('|').map((part) => part.trim());
      return { name, description, example_topics };
    });
}

function serializePillars(pillars = []) {
  return pillars.map((pillar) => [pillar.name, pillar.description, pillar.example_topics].join(' | ')).join('\n');
}

export function BrandSettings({ brandProfile = DEFAULT_BRAND_PROFILE, onSave }) {
  const initial = useMemo(() => ({
    ...DEFAULT_BRAND_PROFILE,
    ...brandProfile,
    pillarsText: serializePillars(brandProfile.content_pillars || [])
  }), [brandProfile]);
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  return (
    <div className="space-y-4">
      <div className="space-y-2 mb-4">
        <h2 className="text-3xl font-bold text-white">Brand settings</h2>
        <p className="max-w-2xl text-sm text-zinc-400">Store the voice, audience, and pillar map used by the content generator.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={draft.brand_name} onChange={(event) => setDraft((current) => ({ ...current, brand_name: event.target.value }))} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Brand name" />
        <input value={draft.industry} onChange={(event) => setDraft((current) => ({ ...current, industry: event.target.value }))} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Industry" />
        <input value={draft.target_audience} onChange={(event) => setDraft((current) => ({ ...current, target_audience: event.target.value }))} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 md:col-span-2" placeholder="Target audience" />
        <textarea value={draft.brand_voice} onChange={(event) => setDraft((current) => ({ ...current, brand_voice: event.target.value }))} rows={4} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 md:col-span-2" placeholder="Brand voice" />
        <textarea value={draft.competitor_urls} onChange={(event) => setDraft((current) => ({ ...current, competitor_urls: event.target.value }))} rows={3} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 md:col-span-2" placeholder="Competitor URLs, comma-separated" />
        <textarea value={draft.pillarsText} onChange={(event) => setDraft((current) => ({ ...current, pillarsText: event.target.value }))} rows={4} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 md:col-span-2" placeholder="content pillar per line: name | description | example topics" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave?.({
            ...draft,
            content_pillars: normalizePillars(draft.pillarsText)
          })}
          className="rounded-xl bg-cyan-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-cyan-200"
        >
          Save Brand Profile
        </button>
      </div>
    </div>
  );
}
