// Settings → Memory: every decision Echo keeps (agent phase 7), replacing the old note timeline.
import React, { useEffect, useState } from 'react';
import { DecisionRow } from './EchoRemembered';
import { CleanupProposals } from './CleanupProposals';
import { DECISIONS_CHANGED, ECHO_LIMITS, listDecisions, type Decision } from '../../services/echo/decisions';
import { surfaceName } from '../../services/echo/recall';
import { openCleanup } from '../../services/echo/cleanup';
import { agentName } from '../../services/jose/agentNames';

const KIND_LABEL: Record<string, string> = { decision: 'Decision', instruction: 'Instruction', rejection: 'Turned down' };

function kindLabel(d: Decision): string {
  if (d.kind !== 'preference') return KIND_LABEL[d.kind] || d.kind;
  const to = (d.appliesTo || ['all']).map((a) => (a === 'all' ? 'everyone' : agentName(a) || a));
  return `Preference — applies to ${to.join(', ')}`;
}

export function DecisionsPanel() {
  const [all, setAll] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener(DECISIONS_CHANGED, onChange);
    return () => window.removeEventListener(DECISIONS_CHANGED, onChange);
  }, []);
  const items = listDecisions({ status: all ? 'all' : 'active' });
  const active = all ? items.filter((d) => d.status === 'active').length : items.length;
  const cleanup = openCleanup();
  return (
    <div data-testid="echo-decisions" className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-(--text-2)">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Show replaced and forgotten
      </label>
      {active >= ECHO_LIMITS.maxDecisions && (
        <p className="text-xs text-(--warning)">Echo keeps at most {ECHO_LIMITS.maxDecisions} decisions; the oldest are dropped. Tidy memory to keep the ones that matter.</p>
      )}
      {items.length === 0 && <p className="text-xs text-(--text-3)">Nothing saved yet.</p>}
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {items.map((d) => (
          <li key={`${d.id}-${d.status}-${d.text}`} className="rounded-xl bg-(--surface-2) p-2">
            <div className="mb-1 text-[10px] text-(--text-3)">
              {new Date(d.atMs).toLocaleDateString()} · {surfaceName(d.source.surface)} · {kindLabel(d)}{d.status !== 'active' ? ` · ${d.status}` : ''}
            </div>
            <ul><DecisionRow decision={d} onChange={refresh} /></ul>
            {d.why && <p className="mt-1 text-[10px] text-(--text-3)">Because {d.why}</p>}
          </li>
        ))}
      </ul>
      {cleanup?.requestId && <CleanupProposals key={cleanup.id} requestId={cleanup.requestId} stepId={cleanup.stepId || 'echo'} setId={cleanup.id} onDone={refresh} />}
    </div>
  );
}
