import React from 'react';
import { FileText, Image, Video, Mic, Eye, Send } from 'lucide-react';

function MiniField({ label, value, mono = false }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold">{label}</div>
      <div className={`mt-0.5 text-xs leading-snug ${mono ? 'font-mono break-all text-[var(--text-3)]' : 'text-[var(--text-2)]'}`}>{value}</div>
    </div>
  );
}

const STEPS = [
  { key: 'draft', label: 'Draft', icon: FileText },
  { key: 'image', label: 'Image', icon: Image },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'narration', label: 'Script', icon: Mic },
  { key: 'publish-preview', label: 'Preview', icon: Eye, accent: true },
];

function resolveImagePreview(assets) {
  assets = assets || {};
  if (assets.image_preview_base64) return `data:image/png;base64,${assets.image_preview_base64}`;
  if (typeof assets.image_url === 'string' && /^(https?:|data:image\/)/i.test(assets.image_url)) return assets.image_url;
  return null;
}

export function DraftPreview({ activeJob, busy, onRunStep, onApprovePublish, imageRuntime, onStartImageRuntime, onRefreshImageRuntime }) {
  if (!activeJob) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-8 text-center">
        <div className="text-sm font-bold text-[var(--text-2)]">No active job</div>
        <p className="mt-1 text-[10px] text-[var(--text-4)]">Create a job above to see its draft here.</p>
      </div>
    );
  }

  const imagePreview = resolveImagePreview(activeJob.assets);
  const imageRequested = Boolean(activeJob.request?.needs?.image);
  const narrationText = activeJob.narration?.narration_text || activeJob.draft?.narration;
  const imageStatusMessage = activeJob.status === 'failed'
    ? 'PARTIAL — image generation failed. Review the failure and retry the Image production step when the runtime is ready.'
    : activeJob.status === 'image_ready'
      ? 'PARTIAL — the job is marked image-ready, but no preview asset was persisted.'
      : 'PARTIAL — no image asset is available yet for this job.';

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-200">Creative output</span>
          <p className="mt-0.5 text-[10px] text-[var(--text-4)]">Review the work, then move it to the next production step.</p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-4)]">{activeJob.status}</span>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-cyan-300">{activeJob.currentStep || 'brief'}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <MiniField label="Hook" value={activeJob.draft?.hook || '—'} />
          <MiniField label="Caption" value={activeJob.draft?.caption || '—'} />
          <MiniField label="Hashtags" value={activeJob.draft?.hashtags || '—'} />
          <MiniField label="Narration" value={activeJob.narration?.narration_text || activeJob.draft?.narration || '—'} />
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold">Generated image</div>
            {imagePreview ? (
              <img
                src={imagePreview}
                alt={`Generated visual for ${activeJob.request?.idea || 'content job'}`}
                className="mt-2 max-h-64 w-full rounded-md object-contain bg-black/20"
              />
            ) : imageRequested ? (
              <div className="mt-2 space-y-2 text-xs text-amber-200">
                <p>{imageStatusMessage} {imageRuntime?.message || 'Checking ComfyUI…'}</p>
                {!imageRuntime?.checked ? (
                  <button type="button" onClick={onRefreshImageRuntime} className="rounded border border-amber-400/30 px-2 py-1 text-[10px] font-bold uppercase">Retry runtime check</button>
                ) : !imageRuntime?.running && (
                  <button type="button" disabled={imageRuntime?.starting || !imageRuntime?.installed} onClick={onStartImageRuntime} className="rounded border border-amber-400/30 px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">{imageRuntime?.starting ? 'Starting ComfyUI…' : imageRuntime?.installed ? 'Start ComfyUI' : 'Install ComfyUI in Runtimes'}</button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-4)]">Image generation was not selected for this job.</p>
            )}
            {activeJob.assets?.image_path && <div className="mt-2 text-[10px] font-mono break-all text-[var(--text-4)]">{activeJob.assets.image_path}</div>}
          </div>
          <MiniField label="Video URL" value={activeJob.assets?.video_url || 'none'} mono />
        </div>

        {narrationText && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold">Narration script</div>
            <p className="mt-1 whitespace-pre-wrap">{narrationText}</p>
          </div>
        )}

        {/* Step buttons */}
        <div className="flex flex-wrap gap-1.5" aria-label="Production steps">
          {STEPS.map(({ key, label, icon: Icon, accent }) => (
            <button
              key={key}
              disabled={busy}
              type="button"
              onClick={() => onRunStep(key)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors disabled:opacity-40 ${
                accent
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
          <button
            disabled={busy}
            type="button"
            onClick={onApprovePublish}
            className="flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
            Publish
          </button>
        </div>

        {(activeJob.preview?.summary || activeJob.draft?.preview_summary) && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
            {activeJob.preview?.summary || activeJob.draft?.preview_summary}
          </div>
        )}
      </div>
    </div>
  );
}
