// Echo's cleanup proposals (agent phase 7): tick what to apply; nothing changes until Apply.
import React, { useState } from 'react';
import { Button } from '../ui';
import { getCleanup } from '../../services/echo/cleanup';
import { applyCleanupStep, dismissCleanupStep } from '../../services/echo/echoPicks';

const KIND: Record<string, string> = { merge: 'Merge', replace: 'Replace', contradiction: 'Keep one', drop: 'Drop', promote: 'Keep as a decision' };

export function CleanupProposals({ requestId, stepId, setId, onDone }: { requestId: string; stepId: string; setId: string; onDone?: (summary: string) => void }) {
  const set = getCleanup(setId);
  const [ticked, setTicked] = useState<string[]>(() => (set?.proposals || []).map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!set) return null;
  const act = async (fn: () => Promise<{ summary: string }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await fn();
      setMessage(out.summary);
      onDone?.(out.summary);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="echo-cleanup" className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs">
      <div className="text-(--text-1)">Echo proposes {set.proposals.length} changes to memory:</div>
      <ul className="space-y-1">
        {set.proposals.map((p) => (
          <li key={p.id} className="flex items-start gap-2">
            <input
              id={`cleanup-${setId}-${p.id}`}
              type="checkbox"
              aria-label={p.reason}
              disabled={set.status !== 'open'}
              checked={ticked.includes(p.id)}
              onChange={(e) => setTicked((t) => (e.target.checked ? [...t, p.id] : t.filter((x) => x !== p.id)))}
            />
            <label htmlFor={`cleanup-${setId}-${p.id}`} className="text-(--text-2)">
              <span className="font-medium text-(--text-1)">{KIND[p.kind] || p.kind}:</span> {p.text ? `${p.text} — ` : ''}{p.reason}
            </label>
          </li>
        ))}
      </ul>
      {set.status === 'open' ? (
        <div className="flex gap-2">
          <Button variant="primary" disabled={busy || !ticked.length} onClick={() => act(() => applyCleanupStep(requestId, stepId, ticked))}>Apply</Button>
          <Button variant="ghost" disabled={busy} onClick={() => act(() => dismissCleanupStep(requestId, stepId))}>Not now</Button>
        </div>
      ) : null}
      {message && <p className="text-(--text-2)">{message}</p>}
    </div>
  );
}
