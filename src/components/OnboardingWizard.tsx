
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { checkOllama, fetchOllamaModels, normalizeEndpoint, pullOllamaModel } from '../lib/ollama';
import { setStorage } from '../lib/appStorage';
import { buildOllamaPreflightEvent, recordEvent as recordOllamaPreflightEvent } from '../services/eventsService';
import { invoke } from '@tauri-apps/api/core';
import { setComposioConfig } from '../services/composioService';

function openExternal(url) {
  invoke('open_url', { url }).catch(() => { window.open(url, '_blank'); });
}

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const PREFERRED_PRESELECT = 'llama3.2:3b';

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep }) {
  const steps = ['Check Ollama', 'Pick a model', 'Connect', "You're ready"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
              i < currentStep
                ? 'bg-[var(--success)] text-[var(--surface-0)]'
                : i === currentStep
                  ? 'bg-[var(--accent)] text-[var(--surface-0)] ring-2 ring-[var(--accent)]/30'
                  : 'bg-[var(--surface-3)] text-[var(--text-3)]'
            }`}
          >
            {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px transition-all ${i < currentStep ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Check Ollama (enhanced with Runtime Hub auto-start) ──────────────

function CheckOllamaStep({ onNext }) {
  const [status, setStatus] = useState('checking'); // checking | connected | not_installed | not_running | no_models | error
  const [message, setMessage] = useState('Checking Ollama...');
  const [isRetrying, setIsRetrying] = useState(false);
  const [prereqs, setPrereqs] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState(null);
  const hasMountedRef = useRef(false);

  const runCheck = async () => {
    setStatus('checking');
    setMessage('Checking Ollama...');
    setIsRetrying(true);
    setStartMsg(null);

    // Gap fix: check if Ollama binary is installed at all (via runtime prereqs)
    let pq = prereqs;
    if (!pq) {
      try {
        const { checkPrerequisites } = await import('../services/runtimeManagerService');
        pq = await checkPrerequisites();
        setPrereqs(pq);
      } catch {
        // non-fatal — continue with ollama check
      }
    }

    const correlationId = `onboarding-ollama-preflight-${Date.now()}`;
    try {
      const result = await checkOllama(DEFAULT_ENDPOINT, '');
      const okState = result.state === 'connected' || result.state === 'model_missing' || result.state === 'no_models';
      const modelName = result.selectedModel || result.models?.[0]?.name || '';
      try {
        const ev = buildOllamaPreflightEvent({
          endpoint: DEFAULT_ENDPOINT,
          model: modelName,
          ok: okState,
          error: okState ? null : (result.error || result.message || result.state),
          correlationId,
        });
        await recordOllamaPreflightEvent(ev);
      } catch {
        // observability only — non-blocking
      }
      if (result.state === 'connected' || result.state === 'model_missing') {
        setStatus('connected');
        setMessage('Ollama is running and ready.');
      } else if (result.state === 'no_models') {
        setStatus('no_models');
        setMessage('Ollama is running but no models are installed yet.');
      } else if (pq && !pq.ollamaFound) {
        setStatus('not_installed');
        setMessage('Ollama is not installed on this machine.');
      } else {
        setStatus('not_running');
        setMessage(result.message || 'Ollama is not running.');
      }
    } catch {
      try {
        const ev = buildOllamaPreflightEvent({
          endpoint: DEFAULT_ENDPOINT, model: '', ok: false, error: 'preflight_threw', correlationId,
        });
        await recordOllamaPreflightEvent(ev);
      } catch { /* non-blocking */ }
      if (pq && !pq.ollamaFound) {
        setStatus('not_installed');
        setMessage('Ollama is not installed on this machine.');
      } else {
        setStatus('not_running');
        setMessage('Could not reach Ollama. Make sure it is running.');
      }
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    runCheck();
  }, []);

  // Gap fix: auto-start Ollama via Runtime Hub, then poll until ready
  const handleStartOllama = async () => {
    setStarting(true);
    setStartMsg('Starting Ollama via Runtime Hub…');
    try {
      const { startTool, waitForTool } = await import('../services/runtimeManagerService');
      const result = await startTool('ollama');
      if (!result.ok) {
        setStartMsg(result.message);
        setStarting(false);
        return;
      }
      setStartMsg('Ollama starting — waiting for it to come online…');
      const up = await waitForTool('ollama', 30_000);
      if (up) {
        setStartMsg(null);
        runCheck();
      } else {
        setStartMsg('Ollama did not respond in 30s. Try starting it manually.');
      }
    } catch (e) {
      setStartMsg(String(e));
    } finally {
      setStarting(false);
    }
  };

  const canProceed = status === 'connected' || status === 'no_models';

  const statusConfig = {
    checking:     { dot: 'bg-[var(--text-4)] animate-pulse', text: 'text-[var(--text-3)]',    border: 'border-white/[0.06] bg-[var(--surface-1)/0.4]' },
    connected:    { dot: 'bg-emerald-400',             text: 'text-emerald-300', border: 'border-emerald-500/30 bg-emerald-500/10' },
    no_models:    { dot: 'bg-amber-400',               text: 'text-amber-300',   border: 'border-amber-500/30 bg-amber-500/10' },
    not_running:  { dot: 'bg-red-400',                 text: 'text-red-300',     border: 'border-red-500/30 bg-red-500/10' },
    not_installed:{ dot: 'bg-red-400',                 text: 'text-red-300',     border: 'border-red-500/30 bg-red-500/10' },
    error:        { dot: 'bg-red-400',                 text: 'text-red-300',     border: 'border-red-500/30 bg-red-500/10' },
  };
  const cfg = statusConfig[status] || statusConfig.checking;

  const statusLabel = {
    checking: 'Checking…',
    connected: 'Connected',
    no_models: 'Running (no models)',
    not_running: 'Not running',
    not_installed: 'Not installed',
    error: 'Unreachable',
  }[status] || status;

  return (
    <div className="flex flex-col">
      <h2 className="text-lg font-bold text-white mb-1">Check Ollama</h2>
      <p className="text-[var(--text-3)] text-sm mb-6">
        Alphonso needs Ollama running locally to power all AI responses.
      </p>

      {/* Status card */}
      <div className={`flex items-start gap-3 rounded-xl border px-4 py-4 mb-4 transition-all ${cfg.border}`}>
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
        <div>
          <div className={`text-sm font-semibold ${cfg.text}`}>{statusLabel}</div>
          <div className="text-xs text-[var(--text-3)] mt-0.5">{message}</div>
          {startMsg && <div className="text-xs text-amber-300 mt-1">{startMsg}</div>}
        </div>
      </div>

      {/* Not installed — download prompt */}
      {status === 'not_installed' && (
        <div className="rounded-xl border border-white/[0.06] bg-[var(--surface-1)/0.6] px-4 py-3 mb-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-4)]">Install Ollama</div>
          <p className="text-xs text-[var(--text-3)]">
            Download and run the Ollama installer, then come back and click Retry.
          </p>
          <button
            onClick={() => openExternal('https://ollama.com/download')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors"
          >
            <ExternalLink size={11} /> Download Ollama
          </button>
        </div>
      )}

      {/* Not running — auto-start via Runtime Hub */}
      {status === 'not_running' && (
        <div className="rounded-xl border border-white/[0.06] bg-[var(--surface-1)/0.6] px-4 py-3 mb-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-4)]">Start Ollama</div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleStartOllama}
              disabled={starting}
              className="flex items-center gap-2 w-fit text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-4)] text-white transition-colors"
            >
              {starting ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              Start automatically
            </button>
            <div className="text-[10px] text-[var(--text-4)]">Or start manually in a terminal:</div>
            <div className="font-mono text-xs bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-emerald-400 select-all">
              ollama serve
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mt-2">
        <button
          onClick={runCheck}
          disabled={isRetrying || starting}
          className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          Retry
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-4)] text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Pick a model ─────────────────────────────────────────────────────

function PickModelStep({ onNext }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(null);
  const [pullComplete, setPullComplete] = useState(false);
  const [pullError, setPullError] = useState(null);

  const refreshModels = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchOllamaModels(DEFAULT_ENDPOINT)
      .then(({ models: fetched }) => {
        setModels(fetched);
        const preferred = fetched.find((m) => m.name === PREFERRED_PRESELECT);
        setSelected(preferred ? preferred.name : fetched[0]?.name || '');
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err?.message || err));
        setLoading(false);
      });
  }, []);

  useEffect(() => { refreshModels(); }, [refreshModels]);

  const handlePullModel = async () => {
    setPulling(true);
    setPullError(null);
    setPullComplete(false);
    setPullProgress(null);
    try {
      await pullOllamaModel({
        endpoint: DEFAULT_ENDPOINT,
        model: PREFERRED_PRESELECT,
        onProgress: (progress) => setPullProgress(progress),
      });
      setPullComplete(true);
      refreshModels();
    } catch (err) {
      setPullError(String(err?.message || err));
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="flex flex-col">
      <h2 className="text-lg font-bold text-white mb-1">Pick a model</h2>
      <p className="text-[var(--text-3)] text-sm mb-6">
        Choose which local model Alphonso will use for conversations.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-3)] py-4">
          <div className="w-2 h-2 rounded-full bg-[var(--text-4)] animate-pulse" /> Loading installed models...
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300 mb-4">
          Could not load models: {error}
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
          <div className="text-xs font-semibold text-amber-300 mb-1">No models installed</div>
          <div className="text-[11px] text-[var(--text-3)] mb-3">
            Download the recommended model or run{' '}
            <code className="font-mono text-emerald-400">ollama pull {PREFERRED_PRESELECT}</code> in a terminal.
          </div>
          <button
            onClick={handlePullModel}
            disabled={pulling}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-4)] text-white text-xs font-bold rounded-xl transition-colors"
          >
            {pulling ? (
              <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Downloading...</>
            ) : pullComplete ? (
              <><CheckCircle className="w-3.5 h-3.5" /> Downloaded</>
            ) : (
              <><Download className="w-3.5 h-3.5" /> Download {PREFERRED_PRESELECT}</>
            )}
          </button>
          {pulling && pullProgress && (
            <div className="mt-2">
              <div className="text-[10px] text-[var(--text-4)] mb-1">{pullProgress.status}</div>
              {pullProgress.percent !== null && (
                <div className="w-full bg-[var(--surface-2)] rounded-full h-1.5">
                  <div className="bg-[var(--accent)] h-1.5 rounded-full transition-all" style={{ width: `${pullProgress.percent}%` }} />
                </div>
              )}
            </div>
          )}
          {pullComplete && <div className="text-[11px] text-emerald-400 mt-2">Model downloaded. Refreshing list...</div>}
          {pullError && <div className="text-[11px] text-red-400 mt-2">Download failed: {pullError}</div>}
        </div>
      )}

      {!loading && models.length > 0 && (
        <div className="space-y-2 mb-6 max-h-[240px] overflow-y-auto pr-1">
          {models.map((model) => {
            const isSelected = model.name === selected;
            const isPreferred = model.name === PREFERRED_PRESELECT;
            return (
              <button
                key={model.name}
                onClick={() => setSelected(model.name)}
                className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                  isSelected ? 'border-[var(--accent-border)] bg-[var(--accent-dim)]' : 'border-white/[0.06] bg-[var(--surface-1)/0.6] hover:border-white/10 hover:bg-[var(--surface-2)/0.6]'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-[var(--text-1)]">{model.name}</span>
                    {isPreferred && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] border border-[var(--accent-border)] bg-[var(--accent-dim)] rounded px-1.5 py-0.5">
                        Recommended
                      </span>
                    )}
                  </div>
                  {model.size > 0 && <span className="text-[11px] text-[var(--text-4)]">{(model.size / 1e9).toFixed(1)} GB</span>}
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button
          onClick={() => { if (selected) onNext(selected); }}
          disabled={!selected}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-4)] text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Connect (channel + Composio) ────────────────────────────────────

const CHANNEL_OPTIONS = [
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Send and receive messages via Telegram Bot API.',
    Icon: MessageCircle,
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/10',
    iconBorder: 'border-sky-500/20',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Connect WhatsApp Cloud for messaging.',
    Icon: Phone,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    iconBorder: 'border-emerald-500/20',
  },
  {
    id: 'composio',
    name: 'Composio (100+ tools)',
    description: 'Connect GitHub, Notion, Slack, Gmail, and 100+ apps via Composio.',
    Icon: Wrench,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    iconBorder: 'border-violet-500/20',
  },
  {
    id: 'none',
    name: 'Skip for now',
    description: 'Configure channels later in Settings → Connectors.',
    Icon: ArrowRight,
    iconColor: 'text-[var(--text-3)]',
    iconBg: 'bg-[var(--surface-2)]',
    iconBorder: 'border-white/[0.06]',
  },
];

// WhatsApp Railway deploy guide (inline, collapsible)
function WhatsAppDeployGuide() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/5 transition-colors"
      >
        <span>How to set up WhatsApp Cloud</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-[var(--text-3)]">
          <ol className="space-y-2 list-none">
            <li className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">1.</span> Create a Meta App at <button onClick={() => openExternal('https://developers.facebook.com')} className="text-emerald-400 underline hover:text-emerald-300 transition-colors">developers.facebook.com</button> → Add WhatsApp product.</li>
            <li className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">2.</span> Deploy the Alphonso gateway to Railway (one-click from your repo):</li>
          </ol>
          <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-3 py-2 font-mono text-emerald-400">
            <span className="flex-1 text-[10px] select-all">gateway/whatsapp-cloud/</span>
            <button onClick={() => copy('gateway/whatsapp-cloud/', 'dir')} className="text-[var(--text-4)] hover:text-white transition-colors">
              {copied === 'dir' ? <CheckCircle size={11} className="text-emerald-400" /> : <Copy size={11} />}
            </button>
          </div>
          <ol className="space-y-2 list-none">
            <li className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">3.</span> Set Railway env vars: <code className="text-emerald-400">WHATSAPP_VERIFY_TOKEN</code>, <code className="text-emerald-400">WHATSAPP_APP_SECRET</code>, <code className="text-emerald-400">WHATSAPP_ALLOWED_NUMBERS</code>.</li>
            <li className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">4.</span> Add your Railway URL as the Meta webhook URL. Verify token must match.</li>
            <li className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">5.</span> In Alphonso Settings → Connectors → WhatsApp: enter your Access Token, Phone Number ID, Verify Token, and Gateway Drain URL.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

// Telegram bot setup guide (inline, collapsible)
function TelegramSetupGuide() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (token.trim()) {
      try {
        localStorage.setItem('alphonso_telegram_bot_token_v1', token.trim());
      } catch { /* ignore */ }
      setSaved(true);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/5 transition-colors"
      >
        <span>How to create a Telegram Bot</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-[var(--text-3)]">
          <ol className="space-y-2 list-none">
            <li className="flex gap-2"><span className="text-sky-400 font-bold shrink-0">1.</span> Open Telegram and search for <button onClick={() => openExternal('https://t.me/BotFather')} className="text-sky-400 underline hover:text-sky-300 transition-colors">@BotFather</button>.</li>
            <li className="flex gap-2"><span className="text-sky-400 font-bold shrink-0">2.</span> Send <code className="text-emerald-400 font-mono">/newbot</code> and follow the prompts to name your bot.</li>
            <li className="flex gap-2"><span className="text-sky-400 font-bold shrink-0">3.</span> BotFather will send you a token like <code className="text-emerald-400 font-mono">123456:ABC-DEF…</code> — paste it below.</li>
            <li className="flex gap-2"><span className="text-sky-400 font-bold shrink-0">4.</span> Send <code className="text-emerald-400 font-mono">/start</code> to your new bot in Telegram to activate it.</li>
          </ol>
          {saved ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle size={12} /> Token saved. Finish setup in Settings → Connectors → Telegram.
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="123456:ABC-DEFGHIJKLMNOPabcdefghijklmnop"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="flex-1 min-w-0 rounded-lg bg-[var(--surface-1)] border border-white/10 text-xs px-3 py-1.5 text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-sky-500/50"
              />
              <button
                onClick={handleSave}
                disabled={!token.trim()}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-[var(--surface-3)] disabled:text-[var(--text-4)] text-white text-xs font-bold transition-colors"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Composio setup guide (inline)
function ComposioSetupGuide() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (apiKey.trim()) {
      setComposioConfig({ apiKey: apiKey.trim(), enabled: true });
      setSaved(true);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Composio Setup</div>
      <ol className="space-y-1.5 text-xs text-[var(--text-3)] list-none">
        <li className="flex gap-2"><span className="text-violet-400 font-bold shrink-0">1.</span> Sign up at <button onClick={() => openExternal('https://composio.dev')} className="text-violet-400 underline hover:text-violet-300 transition-colors">composio.dev</button> (free tier available).</li>
        <li className="flex gap-2"><span className="text-violet-400 font-bold shrink-0">2.</span> Copy your API key from Dashboard → Settings.</li>
        <li className="flex gap-2"><span className="text-violet-400 font-bold shrink-0">3.</span> Paste it below — you can also set it later in Settings → Composio.</li>
      </ol>
      {saved ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle size={12} /> API key saved. Enable toolkits in Settings → Composio.
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="composio_api_key_…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 min-w-0 rounded-lg bg-[var(--surface-1)] border border-white/10 text-xs px-3 py-1.5 text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-violet-500/50"
          />
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-[var(--surface-3)] disabled:text-[var(--text-4)] text-white text-xs font-bold transition-colors"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function ConnectChannelStep({ onNext }) {
  const [selected, setSelected] = useState(null);

  const handleContinue = () => {
    const value = selected ?? 'none';
    localStorage.setItem('alphonso_onboarding_connector_v1', value);
    onNext();
  };

  return (
    <div className="flex flex-col">
      <h2 className="text-lg font-bold text-white mb-1">Connect</h2>
      <p className="text-[var(--text-3)] text-sm mb-6">
        Pick a channel or toolkit to extend Alphonso's reach. You can configure all of these later in Settings.
      </p>

      <div className="space-y-2 mb-4">
        {CHANNEL_OPTIONS.map(({ id, name, description, Icon, iconColor, iconBg, iconBorder }) => {
          const isSelected = selected === id;
          return (
            <div key={id}>
              <button
                onClick={() => setSelected(id)}
                className={`w-full flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all ${
                  isSelected
                    ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/20'
                    : 'border-white/[0.06] bg-[var(--surface-1)/0.6] hover:border-white/10 hover:bg-[var(--surface-2)/0.6]'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconBg} ${iconBorder}`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-1)]">{name}</div>
                  <div className="text-[11px] text-[var(--text-4)] mt-0.5">{description}</div>
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>

              {/* Inline expanded guides when selected */}
              {isSelected && id === 'telegram' && <TelegramSetupGuide />}
              {isSelected && id === 'whatsapp' && <WhatsAppDeployGuide />}
              {isSelected && id === 'composio' && <ComposioSetupGuide />}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleContinue}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: You're ready ─────────────────────────────────────────────────────

function ReadyStep({ selectedModel, onFinish }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
        <Zap className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-3">You're ready</h2>
      <p className="text-[var(--text-3)] text-sm leading-relaxed max-w-sm mb-4">
        Alphonso is configured and ready to go.
      </p>

      {selectedModel && (
        <div className="rounded-xl border border-white/[0.06] bg-[var(--surface-1)/0.6] px-5 py-3 mb-8 w-full max-w-xs">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-4)] mb-1">Selected model</div>
          <div className="font-mono text-sm text-[var(--accent)] font-semibold">{selectedModel}</div>
        </div>
      )}

      <button
        onClick={onFinish}
        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg"
      >
        Start chatting <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Root wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [selectedModel, setSelectedModel] = useState('');

  const handleFinish = () => {
    setStorage('alphonso_onboarding_complete_v1', true);
    onComplete(selectedModel);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--surface-0)]">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-transparent to-cyan-950/20 pointer-events-none" />
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--surface-1)]/90 backdrop-blur-xl shadow-2xl p-8">
          {/* Brand header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Alphonso</div>
              <div className="text-[10px] text-[var(--text-4)]">Local-first AI assistant</div>
            </div>
          </div>

          <StepIndicator currentStep={step} />

          {step === 0 && <CheckOllamaStep onNext={() => setStep(1)} />}
          {step === 1 && <PickModelStep onNext={(model) => { setSelectedModel(model); setStep(2); }} />}
          {step === 2 && <ConnectChannelStep onNext={() => setStep(3)} />}
          {step === 3 && <ReadyStep selectedModel={selectedModel} onFinish={handleFinish} />}
        </div>
        <div className="mt-4 text-center text-[10px] text-[var(--text-4)]">
          Local-first · Zero cloud · All data stays on your machine
        </div>
      </div>
    </div>
  );
}
