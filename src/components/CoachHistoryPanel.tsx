import React from 'react';
import { getCoachHistory, clearCoachHistory, type CoachHistoryEntry } from '../services/coachHistoryService';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-[var(--error-dim)] border-[var(--error)]/20 text-[var(--error)]',
  warning: 'bg-[var(--warning-dim)] border-[var(--warning)]/20 text-[var(--warning)]',
  neutral: 'bg-[var(--info-dim)] border-[var(--info)]/20 text-[var(--info)]',
  positive: 'bg-[var(--success-dim)] border-[var(--success)]/20 text-[var(--success)]',
};

export function CoachHistoryPanel() {
  const [history, setHistory] = React.useState<CoachHistoryEntry[]>(() => getCoachHistory());

  const items = history.slice(-20).reverse();

  const handleClear = () => {
    clearCoachHistory();
    setHistory([]);
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-4)] text-xs">
        Coach Mode hasn't said anything yet. Interventions will show up here once a detector fires.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label">Coach History ({items.length})</p>
        <button
          onClick={handleClear}
          className="text-[10px] text-[var(--text-4)] hover:text-[var(--text-2)] underline"
        >
          Clear
        </button>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {items.map((entry, i) => (
          <div key={`${entry.id}-${entry.detectedAtMs}-${i}`} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[entry.severity] || SEVERITY_STYLES.neutral}`}>
                  {entry.severity}
                </span>
                <span className="text-[10px] text-[var(--text-4)]">{entry.id}</span>
                <span className="text-[10px] text-[var(--text-4)] ml-auto">
                  {new Date(entry.detectedAtMs).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-[var(--text-2)]">{entry.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
