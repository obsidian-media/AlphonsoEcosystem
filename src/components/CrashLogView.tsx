import React, { useState } from 'react';
import { getCrashLog, clearCrashLog } from '../services/crashLogService';

interface CrashLogEntry {
  timestamp: number;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
}

export function CrashLogView() {
  const [entries, setEntries] = useState<CrashLogEntry[]>(() => getCrashLog());
  const [cleared, setCleared] = useState(false);

  const handleClear = () => {
    clearCrashLog();
    setEntries([]);
    setCleared(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Crash Log</h3>
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-3)]">
            {entries.length}
          </span>
        </div>
        {entries.length > 0 && !cleared && (
          <button
            onClick={handleClear}
            className="text-[11px] text-[var(--text-3)] hover:text-[var(--error)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--error-dim)] border border-transparent hover:border-[var(--error-border)]"
          >
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-[var(--text-3)] text-xs">
          No crash logs recorded
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="rounded-xl bg-[var(--surface-2)] px-4 py-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--text-3)]">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-[var(--error)] font-medium break-words">{entry.message}</p>
              {entry.context && Object.keys(entry.context).length > 0 && (
                <p className="text-[10px] text-[var(--text-4)] font-mono">
                  context: {Object.keys(entry.context).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
