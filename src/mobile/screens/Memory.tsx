// What Echo remembers, on the phone (phase 3 part A, owner 2026-11-02): his newest decisions, a
// search the computer answers, and his clean-up with Apply / Dismiss. Saying "Remember that …" in
// Chat (the keyboard's microphone works) saves a new one.
import React, { useEffect, useState } from 'react';
import { reasonOf, type MoreData } from '../../services/phone/remoteData';
import type { Decision } from '../../services/echo/decisions';

const KIND_LABEL: Record<string, string> = { decision: 'Decision', preference: 'Preference', instruction: 'Instruction', rejection: 'Rejected' };

function DecisionItem({ d }: { d: Decision }) {
  return (
    <li className="rounded-xl bg-(--surface-2) p-3">
      <span className="block text-xs text-(--text-3)">{KIND_LABEL[d.kind] || d.kind} · {new Date(d.atMs).toLocaleDateString()}</span>
      <span className="block">{d.text}</span>
      {d.why && <span className="block text-xs text-(--text-2)">{d.why}</span>}
    </li>
  );
}

export function MemoryScreen({ more }: { more: MoreData }) {
  const [memory, setMemory] = useState(more.memory());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Decision[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => more.subscribe(() => setMemory(more.memory())), [more]);
  const off = more.readOnly || busy;

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const r = await more.call('memory.search', { query: query.trim() });
      if (r.ok) { setResults(Array.isArray(r.value) ? r.value : []); setMessage(''); } else { setResults(null); setMessage(reasonOf(r)); }
    } finally { setBusy(false); }
  };
  const cleanup = memory.cleanup;
  const answerCleanup = async (name: 'memory.applyCleanup' | 'memory.dismissCleanup') => {
    if (!cleanup) return;
    setBusy(true);
    try {
      const r = await more.call(name, { requestId: cleanup.requestId, stepId: cleanup.stepId, setId: cleanup.setId });
      setMessage(r.ok ? String(r.value?.summary || 'Done.') : reasonOf(r));
    } finally { setBusy(false); }
  };

  const shown = results ?? memory.decisions;
  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-memory">
      {more.readOnly && more.readOnlyReason && <p className="text-xs text-(--text-3)">{more.readOnlyReason}</p>}
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input aria-label="Search what Echo remembers" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-(--surface-2) px-3 py-2" placeholder="Search what Echo remembers" />
        <button type="submit" disabled={off || !query.trim()} className="rounded-lg bg-(--accent) px-4 py-2 text-white">Search</button>
      </form>
      {results && <button type="button" onClick={() => { setResults(null); setQuery(''); }} className="text-xs text-(--accent)">Show the newest instead</button>}
      {cleanup && (
        <section className="space-y-2 rounded-xl bg-(--accent-dim) p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Echo suggests tidying up</h2>
          <ul className="space-y-1 text-xs">{cleanup.proposals.map((p) => <li key={p.id}>{p.reason}</li>)}</ul>
          <div className="flex gap-2">
            <button type="button" disabled={off} onClick={() => void answerCleanup('memory.applyCleanup')} className="min-h-11 flex-1 rounded-lg bg-(--accent) px-4 py-2 text-white">Apply</button>
            <button type="button" disabled={off} onClick={() => void answerCleanup('memory.dismissCleanup')} className="min-h-11 flex-1 rounded-lg bg-(--surface-3) px-4 py-2">Dismiss</button>
          </div>
        </section>
      )}
      {shown.length === 0 && <p className="text-xs text-(--text-3)">{results ? 'Nothing found.' : 'Echo has nothing saved yet. Say "Remember that …" in Chat.'}</p>}
      <ul className="space-y-2">{shown.map((d) => <DecisionItem key={d.id} d={d} />)}</ul>
    </div>
  );
}
