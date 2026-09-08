import React from 'react';
import { X } from 'lucide-react';

interface SentinelFinding {
  severity?: string;
  type?: string;
  pattern?: string;
  recommendation?: string;
}

interface Props {
  finding: SentinelFinding | null;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
  high: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
  medium: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
  low: 'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]',
};

export function SentinelFindingModal({ finding, onClose }: Props) {
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
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-1)] leading-snug">
            {finding.type || finding.pattern || 'Security Finding'}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-surface-3 transition-colors"
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
          <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Pattern</p>
            <p className="text-xs font-mono text-[var(--text-2)] break-all">
              {finding.pattern || 'N/A'}
            </p>
          </div>

          <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Recommendation</p>
            <p className="text-xs text-[var(--text-2)] leading-relaxed">
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
