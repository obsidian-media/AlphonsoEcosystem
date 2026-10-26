// Nova's last verdicts in Settings (agent phase 2, owner 2026-10-25): what each was about
// and what to do first. It replaced a "trend" of one number per day over unrelated things;
// the component keeps its name so Settings needs no other change.
import React, { useEffect, useState } from 'react';
import { listVerdicts, NO_VERDICTS, type SavedVerdict } from '../services/nova/novaVerdicts';

export function NovaHistoryChart({ onOpenRequest }: { onOpenRequest?: (requestId: string) => void } = {}) {
  const [verdicts, setVerdicts] = useState<SavedVerdict[]>([]);

  useEffect(() => {
    setVerdicts(listVerdicts(5));
  }, []);

  if (!verdicts.length) {
    return <p className="text-xs text-(--text-3)">{NO_VERDICTS}</p>;
  }
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <ol className="space-y-2" aria-label="Nova's last verdicts">
      {verdicts.map((v) => (
        <li key={`${v.atMs}-${v.about}`} className="rounded-xl bg-(--surface-2) px-3 py-2">
          <div className="text-xs text-(--text-3)">{day(v.atMs)} · {v.about}</div>
          <div className="text-sm text-(--text-1)">Do first: {v.doFirst}</div>
          {v.requestId && onOpenRequest && (
            <button onClick={() => onOpenRequest(v.requestId as string)} className="text-xs text-(--accent) hover:underline">Open the request</button>
          )}
        </li>
      ))}
    </ol>
  );
}
