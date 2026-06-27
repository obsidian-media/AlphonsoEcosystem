import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Shield, CheckCircle, XCircle } from 'lucide-react';

const ALLOWLIST_KEY = 'alphonso_sentinel_allowlist_v1';

interface AllowlistEntry {
  id: string;
  pattern: string;
  type: 'domain' | 'path' | 'ip';
  note: string;
  addedAt: number;
}

interface MatchResult {
  matched: boolean;
  entry: AllowlistEntry | null;
}

interface TestResult extends MatchResult {
  entryId: string | undefined;
}

interface FormData {
  pattern: string;
  type: 'domain' | 'path' | 'ip';
  note: string;
}

function readAllowlist(): AllowlistEntry[] {
  try {
    const raw = localStorage.getItem(ALLOWLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllowlist(list: AllowlistEntry[]): void {
  localStorage.setItem(ALLOWLIST_KEY, JSON.stringify(list));
}

function matchesAllowlist(url: string, list: AllowlistEntry[]): MatchResult {
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
      if (lower.includes(pattern)) return { matched: true, entry };
    }
  }
  return { matched: false, entry: null };
}

const TYPE_STYLES: Record<string, string> = {
  domain: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  path: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  ip: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

export function SentinelAllowlistPanel() {
  const [list, setList] = useState<AllowlistEntry[]>([]);
  const [form, setForm] = useState<FormData>({ pattern: '', type: 'domain', note: '' });
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setList(readAllowlist());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleAdd(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError('');
    if (!form.pattern.trim()) {
      setError('Pattern is required.');
      return;
    }
    const entry: AllowlistEntry = {
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

  function handleRemove(id: string): void {
    const next = list.filter((e) => e.id !== id);
    writeAllowlist(next);
    setList(next);
    if (testResult && testResult.entryId === id) setTestResult(null);
  }

  function handleTest(): void {
    setTestResult(null);
    const { matched, entry } = matchesAllowlist(testUrl, list);
    setTestResult({ matched, entry, entryId: entry?.id });
  }

  function formatDate(ms: number | undefined): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString();
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Add form */}
      <form onSubmit={handleAdd} className="space-y-1.5">
        {error && <p className="text-[10px] text-red-400">{error}</p>}
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="domain / /path / ip"
            value={form.pattern}
            onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
            className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--accent)]"
          />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'domain' | 'path' | 'ip' }))}
            className="px-1.5 py-1 text-[11px] rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-1)] focus:outline-none w-16"
          >
            <option value="domain">dom</option>
            <option value="path">path</option>
            <option value="ip">ip</option>
          </select>
          <button
            type="submit"
            className="px-2 py-1 text-[11px] rounded bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <input
          type="text"
          placeholder="Note (optional)"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          className="w-full px-2 py-1 text-[11px] rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--accent)]"
        />
      </form>

      {/* Test input */}
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="Test URL…"
          value={testUrl}
          onChange={(e) => { setTestUrl(e.target.value); setTestResult(null); }}
          className="flex-1 min-w-0 px-2 py-1 text-[11px] rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleTest}
          disabled={!testUrl.trim()}
          className="px-2 py-1 text-[11px] rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40"
        >
          Test
        </button>
      </div>
      {testResult && (
        <div className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] border ${
          testResult.matched
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {testResult.matched
            ? <CheckCircle className="w-3 h-3 shrink-0" />
            : <XCircle className="w-3 h-3 shrink-0" />}
          <span className="truncate">
            {testResult.matched
              ? `Matched: "${testResult.entry!.pattern}" (${testResult.entry!.type})`
              : 'No match — normal policy applies.'}
          </span>
        </div>
      )}

      {/* List */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {list.length === 0 ? (
          <p className="text-[10px] text-[var(--text-4)] py-2 text-center">No entries yet.</p>
        ) : (
          list.map((entry) => (
            <div key={entry.id} className="flex items-center gap-1.5 rounded bg-[var(--surface-3)] border border-[var(--border)] px-2 py-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-1)] font-mono truncate">{entry.pattern}</span>
                  <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded border shrink-0 ${TYPE_STYLES[entry.type] || TYPE_STYLES.domain}`}>
                    {entry.type}
                  </span>
                </div>
                {entry.note && <p className="text-[10px] text-[var(--text-3)] truncate">{entry.note}</p>}
              </div>
              <button
                onClick={() => handleRemove(entry.id)}
                className="shrink-0 p-1 rounded text-[var(--text-4)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SentinelAllowlistPanel;
