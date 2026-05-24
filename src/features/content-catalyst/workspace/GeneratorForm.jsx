import React from 'react';

export function GeneratorForm({ form, setForm, brandProfile, injectedIdea, onIdeaUsed, onGenerate, isLoading }) {
  const pillars = Array.isArray(brandProfile?.content_pillars) ? brandProfile.content_pillars : [];
  const pillarOptions = pillars.length > 0 ? pillars : [{ name: 'General', description: 'General brand content' }];

  return (
    <div className="space-y-6 rounded-[3rem] border border-primary/20 bg-zinc-950/90 p-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">Generator Form</h2>
        <p className="text-sm text-zinc-400">Brief, draft, asset, and preview generation all start here.</p>
      </div>

      {injectedIdea ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-200">Injected idea</div>
          <div>{injectedIdea}</div>
          <button type="button" className="mt-3 rounded-lg border border-amber-300/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-50" onClick={onIdeaUsed}>
            Use idea
          </button>
        </div>
      ) : null}

      <textarea value={form.idea} onChange={(event) => setForm((current) => ({ ...current, idea: event.target.value }))} rows={4} placeholder="Idea" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      <textarea value={form.business_context} onChange={(event) => setForm((current) => ({ ...current, business_context: event.target.value }))} rows={3} placeholder="Business context" className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <input value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="platform" />
        <input value={form.format} onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="format" />
        <input value={form.tone} onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="tone" />
      </div>

      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        Content pillar
        <select value={form.pillar || ''} onChange={(event) => setForm((current) => ({ ...current, pillar: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          <option value="">General</option>
          {pillarOptions.map((pillar) => (
            <option key={pillar.name} value={pillar.name}>{pillar.name}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['image', 'Image'],
          ['video', 'Video'],
          ['narration', 'Narration'],
          ['publish', 'Publish']
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setForm((current) => ({ ...current, needs: { ...current.needs, [key]: !current.needs[key] } }))}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest ${form.needs[key] ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-zinc-900 text-zinc-300'}`}
          >
            {label}: {form.needs[key] ? 'on' : 'off'}
          </button>
        ))}
      </div>

      <button type="button" disabled={isLoading || !form.idea.trim()} onClick={onGenerate} className="rounded-xl bg-cyan-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">
        {isLoading ? 'Working...' : 'Create Content Job'}
      </button>
    </div>
  );
}
