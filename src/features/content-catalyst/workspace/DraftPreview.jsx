import React from 'react';

function MiniField({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/45 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-[11px] ${mono ? 'font-mono break-all' : 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}

export function DraftPreview({ activeJob, busy, onRunStep, onApprovePublish }) {
  if (!activeJob) {
    return (
      <div className="rounded-[3rem] border border-dashed border-primary/10 bg-zinc-950/80 p-12 text-center">
        <div className="text-2xl font-bold text-white">Ready to Launch?</div>
        <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-400">Enter an idea and Alphonso will prepare a full content package.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[3rem] border border-primary/20 bg-zinc-950/90 p-6">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300">{activeJob.status}</span>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">{activeJob.currentStep || 'brief'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-300">
        <MiniField label="Hook" value={activeJob.draft?.hook || 'pending'} />
        <MiniField label="Caption" value={activeJob.draft?.caption || 'pending'} />
        <MiniField label="Hashtags" value={activeJob.draft?.hashtags || 'pending'} />
        <MiniField label="Narration" value={activeJob.narration?.narration_text || activeJob.draft?.narration || 'pending'} />
      </div>
      <div className="grid grid-cols-1 gap-2 text-[11px] text-zinc-300">
        <MiniField label="Image" value={activeJob.assets?.image_url || 'none'} mono />
        <MiniField label="Video" value={activeJob.assets?.video_url || 'none'} mono />
        <MiniField label="Narration URL" value={activeJob.assets?.narration_url || 'none'} mono />
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} type="button" onClick={() => onRunStep('draft')} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Draft</button>
        <button disabled={busy} type="button" onClick={() => onRunStep('image')} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Image</button>
        <button disabled={busy} type="button" onClick={() => onRunStep('video')} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Video</button>
        <button disabled={busy} type="button" onClick={() => onRunStep('narration')} className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Narration</button>
        <button disabled={busy} type="button" onClick={() => onRunStep('publish-preview')} className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-100">Preview</button>
        <button disabled={busy} type="button" onClick={onApprovePublish} className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-100">Publish</button>
      </div>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/45 p-3 text-sm text-zinc-200">
        {activeJob.preview?.summary || activeJob.draft?.preview_summary || 'Preview not generated yet.'}
      </div>
      <pre className="max-h-72 overflow-auto rounded-2xl border border-white/10 bg-zinc-950/90 p-3 text-[11px] leading-relaxed text-zinc-200">
        {JSON.stringify(activeJob.publish || activeJob.preview || {}, null, 2)}
      </pre>
    </div>
  );
}
