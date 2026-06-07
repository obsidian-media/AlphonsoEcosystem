/**
 * Alphonso — Ollama Preflight Baseline Panel
 *
 * OperatorDashboard card that surfaces the canonical ollama.preflight events
 * recorded by OnboardingWizard and any future preflight probes. Read-mostly:
 * one button ("Re-run preflight") records a new event; everything else is
 * aggregated from the local events table.
 *
 * The actual runtime check is owned by `lib/ollama.js → checkOllama`. This
 * panel just records the outcome as an event and surfaces the historical
 * record. It never blocks if the events table is unavailable.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  buildOllamaPreflightEvent,
  listEvents,
  recordEvent,
  EVENT_OUTCOMES
} from '../services/eventsService';
import { checkOllama, normalizeEndpoint } from '../lib/ollama';

const PREFILIGHT_EVENT_TYPE = 'ollama.preflight';
const DEFAULT_ENDPOINT = 'http://localhost:11434';
const PREFERRED_PRESELECT = 'llama3.2:3b';
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function formatRelative(ts) {
  if (!ts || typeof ts !== 'number') return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function outcomeColor(outcome) {
  if (outcome === EVENT_OUTCOMES.SUCCESS) return 'green';
  if (outcome === EVENT_OUTCOMES.FAILURE) return 'red';
  if (outcome === EVENT_OUTCOMES.BLOCKED) return 'amber';
  if (outcome === EVENT_OUTCOMES.PENDING) return 'amber';
  return 'zinc';
}

export function OllamaPreflightPanel({ endpoint = DEFAULT_ENDPOINT }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      const rows = await listEvents({ eventType: PREFILIGHT_EVENT_TYPE, limit: 50 });
      setEvents(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setLastError(err?.message || 'Failed to load preflight events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const cutoff = Date.now() - LOOKBACK_MS;
    const recent = events.filter((e) => e.occurredAtMs >= cutoff);
    const success = recent.filter((e) => e.outcome === EVENT_OUTCOMES.SUCCESS).length;
    const failure = recent.filter((e) => e.outcome === EVENT_OUTCOMES.FAILURE).length;
    return { total7d: recent.length, success, failure };
  }, [events]);

  const handleRerun = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    setLastResult(null);
    try {
      const cleanEndpoint = normalizeEndpoint(endpoint);
      const result = await checkOllama(cleanEndpoint, '');
      const ok = result.state === 'connected' || result.state === 'model_missing' || result.state === 'no_models';
      const modelName = result.selectedModel || result.models?.[0]?.name || '';
      const correlationId = `operator-preflight-${Date.now()}`;
      const ev = buildOllamaPreflightEvent({
        endpoint: cleanEndpoint,
        model: modelName,
        ok,
        error: ok ? null : (result.error || result.message || result.state),
        correlationId
      });
      const rec = await recordEvent(ev);
      setLastResult({ ev, rec, ollamaState: result.state });
      await refresh();
    } catch (err) {
      setLastError(err?.message || 'Preflight run failed');
    } finally {
      setBusy(false);
    }
  }, [endpoint, refresh]);

  const recent = events.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>Canonical preflight event log (7d window)</span>
        </div>
        <button
          type="button"
          onClick={handleRerun}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 text-[10px] uppercase tracking-widest font-bold text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Running…' : 'Re-run preflight'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Total (7d)</div>
          <div className="text-sm text-zinc-200 font-bold mt-0.5">{stats.total7d}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Success</div>
          <div className="text-sm text-emerald-300 font-bold mt-0.5">{stats.success}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Failure</div>
          <div className={`text-sm font-bold mt-0.5 ${stats.failure > 0 ? 'text-red-300' : 'text-zinc-300'}`}>
            {stats.failure}
          </div>
        </div>
      </div>

      {lastError ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-2 text-[11px] text-red-300">
          <AlertTriangle className="w-3.5 h-3.5" /> {lastError}
        </div>
      ) : null}

      {lastResult ? (
        <div className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-2 text-[11px] text-zinc-300">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Last preflight</div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded border ${
                lastResult.ollamaState === 'connected' || lastResult.ollamaState === 'no_models' || lastResult.ollamaState === 'model_missing'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {lastResult.ollamaState}
            </span>
            <span className="text-zinc-400 text-[10px]">{lastResult.ev?.subjectId || '—'}</span>
            <span className="text-zinc-500 text-[10px]">{lastResult.rec?.ok ? 'event recorded' : 'event NOT recorded'}</span>
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1">
          <Database className="w-3 h-3" /> Recent preflights (max 5)
        </div>
        {recent.length === 0 ? (
          <div className="text-[11px] text-zinc-500 rounded-lg border border-dashed border-white/10 px-2.5 py-3">
            No preflight events yet. Run the onboarding wizard or use Re-run preflight.
          </div>
        ) : (
          <ul className="space-y-1">
            {recent.map((e) => (
              <li key={e.id} className="rounded-lg bg-zinc-900/60 border border-white/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-200 truncate flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-zinc-500" />
                    {e.subjectId || 'runtime'}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {formatRelative(e.occurredAtMs)} · {e.source}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded border shrink-0 ${
                    outcomeColor(e.outcome) === 'green'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : outcomeColor(e.outcome) === 'red'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {e.outcome}
                </span>
              </li>
            ))}
          </ul>
        )}
        {loading && events.length === 0 ? (
          <div className="text-[10px] text-zinc-500 mt-1">Loading…</div>
        ) : null}
      </div>
    </div>
  );
}

export default OllamaPreflightPanel;
