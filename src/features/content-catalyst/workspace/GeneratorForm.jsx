import React from 'react';
import { Sparkles } from 'lucide-react';

export function GeneratorForm({ form, setForm, brandProfile, injectedIdea, onIdeaUsed, onGenerate, isLoading }) {
  const pillars = Array.isArray(brandProfile?.content_pillars) ? brandProfile.content_pillars : [];
  const pillarOptions = pillars.length > 0 ? pillars : [{ name: 'General', description: 'General brand content' }];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-200">Creative brief</span>
          <p className="mt-1 text-xs text-[var(--text-3)]">Describe the outcome. Choose what you want produced.</p>
        </div>
      </div>

      {injectedIdea && (
        <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 flex items-start justify-between gap-2">
          <span className="line-clamp-2">{injectedIdea}</span>
          <button type="button" onClick={onIdeaUsed} className="shrink-0 text-[9px] font-bold uppercase tracking-widest border border-amber-300/30 rounded px-2 py-0.5 hover:bg-amber-400/10">Use</button>
        </div>
      )}

      <textarea
        value={form.idea}
        onChange={(e) => setForm((c) => ({ ...c, idea: e.target.value }))}
        rows={3}
        placeholder="What's the idea? (required)"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] resize-none focus:outline-none focus:border-[var(--accent-border)]"
      />

      <textarea
        value={form.business_context}
        onChange={(e) => setForm((c) => ({ ...c, business_context: e.target.value }))}
        rows={2}
        placeholder="Business context (optional)"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] resize-none focus:outline-none focus:border-[var(--accent-border)]"
      />

      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'platform', placeholder: 'Platform (e.g. Instagram)' },
          { key: 'format', placeholder: 'Format (e.g. Reel)' },
          { key: 'tone', placeholder: 'Tone (e.g. Casual)' },
        ].map(({ key, placeholder }) => (
          <input
            key={key}
            value={form[key]}
            onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))}
            placeholder={placeholder}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1.5 text-xs text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--accent-border)]"
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={form.pillar || ''}
          onChange={(e) => setForm((c) => ({ ...c, pillar: e.target.value }))}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1.5 text-xs text-[var(--text-1)] focus:outline-none"
        >
          <option value="">Pillar — General</option>
          {pillarOptions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[['image', 'Image'], ['video', 'Video'], ['narration', 'Narration'], ['publish', 'Publish']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setForm((c) => ({ ...c, needs: { ...c.needs, [key]: !c.needs[key] } }))}
            className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              form.needs[key]
                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                : 'border-[var(--border)] text-[var(--text-4)] hover:text-[var(--text-2)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-[var(--text-4)]">Image uses your local ComfyUI runtime. Video uses Runway when configured. Publishing always requires approval.</p>

      <button
        type="button"
        disabled={isLoading || !form.idea.trim()}
        onClick={onGenerate}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 text-xs font-bold uppercase tracking-widest px-4 py-2.5 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isLoading ? 'Generating…' : 'Create Content Job'}
      </button>
    </div>
  );
}
