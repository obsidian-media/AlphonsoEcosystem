import React, { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
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
  return pillars.map((p) => [p.name, p.description, p.example_topics].join(' | ')).join('\n');
}

const inputCls = 'rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1.5 text-xs text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]';

export function BrandSettings({ brandProfile = DEFAULT_BRAND_PROFILE, onSave }) {
  const initial = useMemo(() => ({
    ...DEFAULT_BRAND_PROFILE,
    ...brandProfile,
    pillarsText: serializePillars(brandProfile.content_pillars || [])
  }), [brandProfile]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setDraft(initial); }, [initial]);
  const set = (key) => (e) => setDraft((c) => ({ ...c, [key]: e.target.value }));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <Settings className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Brand settings</span>
      </div>
      <div className="p-4 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <input value={draft.brand_name} onChange={set('brand_name')} className={inputCls} placeholder="Brand name" />
          <input value={draft.industry} onChange={set('industry')} className={inputCls} placeholder="Industry" />
        </div>
        <input value={draft.target_audience} onChange={set('target_audience')} className={`${inputCls} w-full`} placeholder="Target audience" />
        <textarea value={draft.brand_voice} onChange={set('brand_voice')} rows={3} className={`${inputCls} w-full resize-none`} placeholder="Brand voice (tone, style, personality)" />
        <textarea value={draft.competitor_urls} onChange={set('competitor_urls')} rows={2} className={`${inputCls} w-full resize-none`} placeholder="Competitor URLs, comma-separated" />
        <textarea value={draft.pillarsText} onChange={set('pillarsText')} rows={3} className={`${inputCls} w-full resize-none font-mono text-[10px]`} placeholder="pillar name | description | example topics (one per line)" />
        <button
          type="button"
          onClick={() => onSave?.({ ...draft, content_pillars: normalizePillars(draft.pillarsText) })}
          className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-[10px] font-bold uppercase tracking-widest px-4 py-2 transition-colors"
        >
          Save Brand Profile
        </button>
      </div>
    </div>
  );
}
