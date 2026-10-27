// What Echo remembered from one request (agent phase 7), under its result in Chat and on the
// board: "Echo remembered: …" with Edit and Forget.
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui';
import { DECISIONS_CHANGED, editDecision, forgetDecision, listDecisions, type Decision } from '../../services/echo/decisions';

const forRequest = (requestId: string): Decision[] => listDecisions().filter((d) => d.source.requestId === requestId);

export function DecisionRow({ decision, onChange, prefix = '' }: { decision: Decision; onChange: () => void; prefix?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(decision.text);
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      {editing ? (
        <>
          <input aria-label="Decision text" className="min-w-0 flex-1 rounded-md bg-(--surface-3) px-2 py-1 text-(--text-1)" value={text} onChange={(e) => setText(e.target.value)} />
          <Button disabled={!text.trim()} onClick={() => { editDecision(decision.id, text.trim()); setEditing(false); onChange(); }}>Save</Button>
          <Button variant="ghost" onClick={() => { setText(decision.text); setEditing(false); }}>Cancel</Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-(--text-1)">{prefix}{decision.text}</span>
          {decision.status === 'active' && (
            <>
              <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="ghost" onClick={() => { forgetDecision(decision.id); onChange(); }}>Forget</Button>
            </>
          )}
        </>
      )}
    </li>
  );
}

export function EchoRemembered({ requestId }: { requestId: string }) {
  const [items, setItems] = useState<Decision[]>(() => forRequest(requestId));
  const refresh = useCallback(() => setItems(forRequest(requestId)), [requestId]);
  useEffect(() => {
    refresh();
    window.addEventListener(DECISIONS_CHANGED, refresh);
    return () => window.removeEventListener(DECISIONS_CHANGED, refresh);
  }, [refresh]);
  if (!items.length) return null;
  return (
    <ul data-testid="echo-remembered" className="mt-2 space-y-1 rounded-xl bg-(--surface-2) p-2">
      {items.map((d) => <DecisionRow key={`${d.id}-${d.text}`} decision={d} onChange={refresh} prefix="Echo remembered: " />)}
    </ul>
  );
}
