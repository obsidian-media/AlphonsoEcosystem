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
  { key: 'narration', label: 'Voice', icon: Mic },
  { key: 'publish-preview', label: 'Preview', icon: Eye, accent: true },
];

export function DraftPreview({ activeJob, busy, onRunStep, onApprovePublish }) {
  if (!activeJob) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-8 text-center">
        <div className="text-sm font-bold text-[var(--text-2)]">No active job</div>
        <p className="mt-1 text-[10px] text-[var(--text-4)]">Create a job above to see its draft here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Draft preview</span>
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
          <MiniField label="Image URL" value={activeJob.assets?.image_url || 'none'} mono />
          <MiniField label="Video URL" value={activeJob.assets?.video_url || 'none'} mono />
        </div>

        {/* Step buttons */}
        <div className="flex flex-wrap gap-1.5">
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
