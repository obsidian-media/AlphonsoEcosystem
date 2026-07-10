import React, { useEffect, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

type VoiceStatus = 'running' | 'stopped' | 'unknown';

export function VoiceView() {
  const [status, setStatus] = useState<VoiceStatus>('unknown');
  const [wsUrl, setWsUrl] = useState('');
  const [pythonFound, setPythonFound] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const { getVoiceServerStatus, getVoiceWebSocketUrl } = await import('../services/voiceOsService');
      const result = await getVoiceServerStatus();
      setStatus(result === 'running' ? 'running' : 'stopped');
      setWsUrl(getVoiceWebSocketUrl());
    } catch {
      setStatus('unknown');
    }
  }

  useEffect(() => {
    refreshStatus();
    (async () => {
      try {
        const { checkPrerequisites } = await import('../services/runtimeManagerService');
        const prereqs = await checkPrerequisites();
        setPythonFound(prereqs ? Boolean(prereqs.pythonFound) : null);
      } catch {
        setPythonFound(null);
      }
    })();
  }, []);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const { startVoiceServer } = await import('../services/voiceOsService');
      await startVoiceServer();
      await refreshStatus();
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setBusy(true);
    setError(null);
    try {
      const { stopVoiceServer } = await import('../services/voiceOsService');
      await stopVoiceServer();
      await refreshStatus();
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const isRunning = status === 'running';

  return (
    <div className="mx-auto max-w-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        {isRunning ? <Mic className="h-5 w-5 text-emerald-400" /> : <MicOff className="h-5 w-5 text-[var(--text-3)]" />}
        <h2 className="text-lg font-semibold text-[var(--text-1)]">Voice OS</h2>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-2)]">Status</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
              isRunning ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}
          >
            {status}
          </span>
        </div>

        {isRunning && wsUrl && (
          <div className="text-xs text-[var(--text-3)]">{wsUrl}</div>
        )}

        {pythonFound === false && (
          <p className="text-xs text-amber-400">
            Python was not found — Voice OS needs Python 3.10+ on PATH before it can start. Check the Runtime Hub for setup.
          </p>
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button
          onClick={isRunning ? handleStop : handleStart}
          disabled={busy}
          className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--surface-0)] disabled:opacity-40"
        >
          {isRunning ? 'Stop' : 'Start'}
        </button>
      </div>

      <p className="text-xs text-[var(--text-3)]">
        Voice OS runs speech-to-text, agent routing, and text-to-speech locally via a Python sidecar process on port 8766.
        Once running, use the mic button in Chat to talk to Alphonso.
      </p>
    </div>
  );
}
