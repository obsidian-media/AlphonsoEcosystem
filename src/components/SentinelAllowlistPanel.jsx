import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Shield, CheckCircle, XCircle } from 'lucide-react';

const ALLOWLIST_KEY = 'alphonso_sentinel_allowlist_v1';

function readAllowlist() {
  try {
    const raw = localStorage.getItem(ALLOWLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllowlist(list) {
  localStorage.setItem(ALLOWLIST_KEY, JSON.stringify(list));
}

function matchesAllowlist(url, list) {
  if (!url) return { matched: false, entry: null };
  const lower = url.toLowerCase().trim();
  for (const entry of list) {
    const pattern = (entry.pattern || '').toLowerCase().trim();
    if (!pattern) continue;
    if (entry.type === 'domain') {
      try {
        const host = new URL(lower.startsWith('http') ? lower : `https://${lower}`).hostname;
        if (host === pattern || host.endsWith(`.${pattern}`)) {
          return { matched: true, entry };
        }
      } catch {
        if (lower.includes(pattern)) return { matched: true, entry };
      }
    } else if (entry.type === 'ip') {
      try {
        const host = new URL(lower.startsWith('http') ? lower : `https://${lower}`).hostname;
        if (host === pattern) return { matched: true, entry };
      } catch {
        if (lower.includes(pattern)) return { matched: true, entry };
      }
    } else {
      // path
      if (lower.includes(pattern)) return { matched: true, entry };
    }
  }
  return { matched: false, entry: null };
}

const TYPE_STYLES = {
  domain: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  path: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  ip: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

export function SentinelAllowlistPanel() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ pattern: '', type: 'domain', note: '' });
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setList(readAllowlist());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleAdd(e) {
    e.preventDefault();
    setError('');
    if (!form.pattern.trim()) {
      setError('Pattern is required.');
      return;
    }
    const entry = {
      id: `sal-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      pattern: form.pattern.trim().toLowerCase(),
      type: form.type,
      note: form.note.trim(),
      addedAt: Date.now(),
    };
    const next = [...list, entry];
    writeAllowlist(next);
    setList(next);
    setForm({ pattern: '', type: 'domain', note: '' });
  }

  function handleRemove(id) {
    const next = list.filter((e) => e.id !== id);
    writeAllowlist(next);
    setList(next);
    if (testResult && testResult.entryId === id) setTestResult(null);
  }

  function handleTest() {
    setTestResult(null);
    const { matched, entry } = matchesAllowlist(testUrl, list);
    setTestResult({ matched, entry, entryId: entry?.id });
  }

  function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString();
  }

  return (
    <div className="flex flex-col gap-5 p-4 h-full">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-emerald-400" />
        <h2 className="text-base font-semibold text-zinc-100">Sentinel Allowlist</h2>
        <span className="text-xs text-zinc-500">({list.length} entr{list.length !== 1 ? 'ies' : 'y'})</span>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="rounded-xl bg-zinc-900/40 border border-white/[0.05] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Add Entry</p>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Pattern (e.g. example.com, /api/path, 192.168.1.1)"
            value={form.pattern}
            onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
            className="flex-1 min-w-48 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 focus:outline-none"
          >
            <option value="domain">Domain</option>
            <option value="path">Path</option>
            <option value="ip">IP</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Note (optional)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </form>

      {/* Test input */}
      <div className="rounded-xl bg-zinc-900/40 border border-white/[0.05] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Test Pattern</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter a URL to test against allowlist…"
            value={testUrl}
            onChange={(e) => { setTestUrl(e.target.value); setTestResult(null); }}
            className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleTest}
            disabled={!testUrl.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-zinc-700 border border-white/[0.08] text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-40"
          >
            Test
          </button>
        </div>
        {testResult && (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${
            testResult.matched
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {testResult.matched
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 shrink-0" />}
            {testResult.matched
              ? `Matched allowlist entry: "${testResult.entry.pattern}" (${testResult.entry.type})`
              : 'No allowlist entry matched — this URL would be subject to normal policy enforcement.'}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {list.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-6">
            No allowlist entries yet. Add a domain, path, or IP above.
          </p>
        ) : (
          list.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl bg-zinc-900/40 border border-white/[0.05] px-4 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-200 font-mono">{entry.pattern}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${TYPE_STYLES[entry.type] || TYPE_STYLES.domain}`}>
                    {entry.type}
                  </span>
                </div>
                {entry.note && (
                  <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{entry.note}</p>
                )}
                <p className="text-[10px] text-zinc-600 mt-0.5">Added {formatDate(entry.addedAt)}</p>
              </div>
              <button
                onClick={() => handleRemove(entry.id)}
                className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Remove entry"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SentinelAllowlistPanel;
