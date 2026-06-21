import React from 'react';
import { X } from 'lucide-react';

const SEVERITY_STYLES = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/20',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  low: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
};

export function SentinelFindingModal({ finding, onClose }) {
  if (!finding) return null;

  const severity = String(finding.severity || 'low').toLowerCase();
  const badgeStyle = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sentinel finding details"
    >
      <div
        className="bg-surface-2 rounded-2xl p-6 max-w-md w-full mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-100 leading-snug">
            {finding.type || finding.pattern || 'Security Finding'}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-surface-3 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${badgeStyle}`}>
            {severity}
          </span>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl bg-zinc-900/60 border border-white/[0.05] p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Pattern</p>
            <p className="text-xs font-mono text-zinc-300 break-all">
              {finding.pattern || 'N/A'}
            </p>
          </div>

          <div className="rounded-xl bg-zinc-900/60 border border-white/[0.05] p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recommendation</p>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {finding.recommendation || 'Review and remediate'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full btn-secondary text-sm py-2"
        >
          Close
        </button>
      </div>
    </div>
  );
}
