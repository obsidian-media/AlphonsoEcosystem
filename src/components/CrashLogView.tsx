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
          <h3 className="text-sm font-semibold text-white">Crash Log</h3>
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 border border-white/[0.06] text-zinc-400">
            {entries.length}
          </span>
        </div>
        {entries.length > 0 && !cleared && (
          <button
            onClick={handleClear}
            className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
          >
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-xs">
          No crash logs recorded
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.06] bg-zinc-900/50 px-4 py-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-red-300 font-medium break-words">{entry.message}</p>
              {entry.context && Object.keys(entry.context).length > 0 && (
                <p className="text-[10px] text-zinc-600 font-mono">
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
