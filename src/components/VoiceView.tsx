import { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Mic, MicOff, RefreshCw, Server, Volume2, XCircle } from 'lucide-react';

type VoiceStatus = 'running' | 'stopped' | 'unknown';

type RuntimeState = {
  checked: boolean;
  installed: boolean;
  running: boolean;
};

function ReadinessRow({ label, detail, ready }: { label: string; detail: string; ready: boolean | null }) {
  const Icon = ready === true ? CheckCircle2 : ready === false ? XCircle : RefreshCw;
  const color = ready === true ? 'text-emerald-400' : ready === false ? 'text-amber-300' : 'text-zinc-500';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
      <div>
        <div className="text-xs font-semibold text-[var(--text-1)]">{label}</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-4)]">{detail}</p>
      </div>
    </div>
  );
}

export function VoiceView() {
  const [status, setStatus] = useState<VoiceStatus>('unknown');
  const [wsUrl, setWsUrl] = useState('');
  const [pythonFound, setPythonFound] = useState<boolean | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState>({ checked: false, installed: false, running: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    setError(null);
    const [{ getVoiceServerStatus, getVoiceWebSocketUrl }, { checkPrerequisites, getAllStatus }] = await Promise.all([
      import('../services/voiceOsService'),
      import('../services/runtimeManagerService')
    ]);

    const [server, prereqs, tools] = await Promise.allSettled([
      getVoiceServerStatus(),
      checkPrerequisites(),
      getAllStatus()
    ]);

    if (server.status === 'fulfilled') setStatus(server.value === 'running' ? 'running' : 'stopped');
    else setStatus('unknown');
    setWsUrl(getVoiceWebSocketUrl());
    setPythonFound(prereqs.status === 'fulfilled' ? Boolean(prereqs.value?.pythonFound) : null);

    if (tools.status === 'fulfilled') {
      const voiceOs = tools.value.find((tool) => tool.name === 'voice-os');
      setRuntime({ checked: true, installed: Boolean(voiceOs?.installed), running: Boolean(voiceOs?.running) });
    } else {
      setRuntime({ checked: false, installed: false, running: false });
    }
  }

  useEffect(() => { void refreshStatus(); }, []);

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
  const canStart = pythonFound === true && runtime.checked && runtime.installed;
  const localSummary = isRunning
    ? 'The local speech pipeline is running. The Chat microphone can connect to it.'
    : pythonFound === false
      ? 'Python is required before the local speech pipeline can start.'
      : runtime.checked && !runtime.installed
        ? 'Voice OS still needs to be installed in Runtimes before local voice is dependable.'
        : 'Start the local speech pipeline when you are ready to use the Chat microphone.';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.13] via-[var(--surface-1)] to-violet-500/[0.10] px-5 py-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Voice console</div>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
              {isRunning ? <Mic className="h-6 w-6 text-emerald-400" /> : <MicOff className="h-6 w-6 text-zinc-500" />}
              Voice OS
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">One view for local speech readiness, the running pipeline, and what still requires a real paired device.</p>
          </div>
          <div className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${isRunning ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`} aria-live="polite">
            {isRunning ? 'Local voice live' : status === 'unknown' ? 'Checking local voice' : 'Local voice offline'}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-1)]"><Server className="h-4 w-4 text-cyan-300" /> Local speech pipeline</div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">{localSummary}</p>
              </div>
              <button type="button" onClick={() => void refreshStatus()} disabled={busy} className="rounded-lg border border-[var(--border)] p-2 text-[var(--text-3)] hover:text-white disabled:opacity-40" aria-label="Refresh voice status">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <ReadinessRow label="Voice OS runtime" ready={runtime.checked ? runtime.installed : null} detail={runtime.checked ? runtime.installed ? 'Installed and available to the desktop application.' : 'Install Voice OS from Runtimes to provide the managed Python environment.' : 'Checking the managed runtime…'} />
              <ReadinessRow label="Python prerequisite" ready={pythonFound} detail={pythonFound === false ? 'Python 3.10+ was not detected. Set it up before starting Voice OS.' : pythonFound === true ? 'Python was detected for the local voice pipeline.' : 'Checking Python availability…'} />
              <ReadinessRow label="WebSocket service" ready={status === 'unknown' ? null : isRunning} detail={isRunning ? `Listening at ${wsUrl}` : 'Not listening. Start the local service after the prerequisites are ready.'} />
            </div>

            {error && <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}

            <button onClick={isRunning ? handleStop : handleStart} disabled={busy || (!isRunning && !canStart)} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition disabled:opacity-40 ${isRunning ? 'border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20' : 'bg-[var(--accent)] text-[var(--surface-0)]'}`}>
              {isRunning ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {busy ? 'Updating voice service…' : isRunning ? 'Stop local voice' : 'Start local voice'}
            </button>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-1)]"><Volume2 className="h-4 w-4 text-violet-300" /> How speech moves</div>
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--text-3)]">
                <li><span className="mr-2 text-cyan-300">01</span>Speak through the Chat microphone.</li>
                <li><span className="mr-2 text-cyan-300">02</span>Voice OS transcribes, routes, and synthesizes locally.</li>
                <li><span className="mr-2 text-cyan-300">03</span>The spoken reply returns through the active client.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-100"><Cloud className="h-4 w-4 text-amber-300" /> Cloud Voice companion</div>
              <p className="mt-2 text-xs leading-relaxed text-amber-100/80">Cloud Voice is a separate iOS path. It requires a paired, enrolled physical device and a real request/reply audio check. This desktop panel does not present Cloud Voice as ready until that check is recorded.</p>
              <div className="mt-3 rounded-lg border border-amber-400/20 bg-black/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-amber-200">Physical-device verification pending</div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
