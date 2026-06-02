import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { checkOllama, fetchOllamaModels } from '../lib/ollama';
import { setStorage } from '../lib/appStorage';

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const PREFERRED_PRESELECT = 'llama3.2:3b';

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }) {
  const steps = ['Check Ollama', 'Pick a model', "You're ready"];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
              i < currentStep
                ? 'bg-emerald-500 text-white'
                : i === currentStep
                  ? 'bg-indigo-500 text-white ring-2 ring-indigo-500/30'
                  : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px transition-all ${i < currentStep ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Check Ollama ────────────────────────────────────────────────────

function CheckOllamaStep({ onNext }) {
  const [status, setStatus] = useState('checking'); // checking | connected | not_running | no_models | error
  const [message, setMessage] = useState('Checking Ollama...');
  const [isRetrying, setIsRetrying] = useState(false);
  const hasMountedRef = useRef(false);

  const runCheck = async () => {
    setStatus('checking');
    setMessage('Checking Ollama...');
    setIsRetrying(true);
    try {
      const result = await checkOllama(DEFAULT_ENDPOINT, '');
      if (result.state === 'connected' || result.state === 'model_missing') {
        setStatus('connected');
        setMessage('Ollama is running and ready.');
      } else if (result.state === 'no_models') {
        setStatus('no_models');
        setMessage('Ollama is running but no models are installed yet.');
      } else {
        setStatus('not_running');
        setMessage(result.message || 'Ollama is not running. Start it with: ollama serve');
      }
    } catch {
      setStatus('error');
      setMessage('Could not reach Ollama. Make sure it is running.');
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    runCheck();
  }, []);

  const canProceed = status === 'connected' || status === 'no_models';

  const statusConfig = {
    checking: { dot: 'bg-zinc-500 animate-pulse', text: 'text-zinc-400', border: 'border-white/[0.06] bg-zinc-900/40' },
    connected: { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/30 bg-emerald-500/10' },
    no_models: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-500/30 bg-amber-500/10' },
    not_running: { dot: 'bg-red-400', text: 'text-red-300', border: 'border-red-500/30 bg-red-500/10' },
    error: { dot: 'bg-red-400', text: 'text-red-300', border: 'border-red-500/30 bg-red-500/10' },
  };
  const cfg = statusConfig[status] || statusConfig.checking;

  return (
    <div className="flex flex-col">
      <h2 className="text-lg font-bold text-white mb-1">Check Ollama</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Alphonso needs Ollama running locally to power AI responses.
      </p>

      <div className={`flex items-start gap-3 rounded-xl border px-4 py-4 mb-4 transition-all ${cfg.border}`}>
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
        <div>
          <div className={`text-sm font-semibold ${cfg.text}`}>
            {status === 'checking' ? 'Checking...' : status === 'connected' ? 'Connected' : status === 'no_models' ? 'Running (no models)' : 'Not running'}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">{message}</div>
        </div>
      </div>

      {(status === 'not_running' || status === 'error') && (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-900/60 px-4 py-3 mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Start Ollama</div>
          <div className="font-mono text-xs bg-black/40 border border-white/5 rounded-lg px-4 py-3 text-emerald-400 select-all">
            ollama serve
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mt-2">
        <button
          onClick={runCheck}
          disabled={isRetrying}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          Retry
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Pick a model ────────────────────────────────────────────────────

function PickModelStep({ onNext }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOllamaModels(DEFAULT_ENDPOINT)
      .then(({ models: fetched }) => {
        if (cancelled) return;
        setModels(fetched);
        const preferred = fetched.find((m) => m.name === PREFERRED_PRESELECT);
        setSelected(preferred ? preferred.name : fetched[0]?.name || '');
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message || err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleNext = () => {
    if (selected) onNext(selected);
  };

  return (
    <div className="flex flex-col">
      <h2 className="text-lg font-bold text-white mb-1">Pick a model</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Choose which local model Alphonso will use for conversations.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 py-4">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
          Loading installed models...
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
          <div className="text-[11px] text-zinc-400">
            Run <code className="font-mono text-emerald-400">ollama pull llama3.2:3b</code> in a terminal, then come back.
          </div>
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
                  isSelected
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-white/[0.06] bg-zinc-900/60 hover:border-white/10 hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-zinc-100">{model.name}</span>
                    {isPreferred && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 border border-indigo-500/30 bg-indigo-500/10 rounded px-1.5 py-0.5">
                        Recommended
                      </span>
                    )}
                  </div>
                  {model.size > 0 && (
                    <span className="text-[11px] text-zinc-500">
                      {(model.size / 1e9).toFixed(1)} GB
                    </span>
                  )}
                </div>
                {isSelected && <CheckCircle className="w-4 h-4 text-indigo-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button
          onClick={handleNext}
          disabled={!selected}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: You're ready ─────────────────────────────────────────────────────

function ReadyStep({ selectedModel, onFinish }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
        <Zap className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-3">You're ready</h2>
      <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mb-4">
        Alphonso is configured and ready to go.
      </p>

      {selectedModel && (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-900/60 px-5 py-3 mb-8 w-full max-w-xs">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Selected model</div>
          <div className="font-mono text-sm text-indigo-300 font-semibold">{selectedModel}</div>
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

// ─── Root wizard ─────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [selectedModel, setSelectedModel] = useState('');

  const handleOllamaNext = () => setStep(1);

  const handleModelNext = (model) => {
    setSelectedModel(model);
    setStep(2);
  };

  const handleFinish = () => {
    setStorage('alphonso_onboarding_complete_v1', true);
    onComplete(selectedModel);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-transparent to-cyan-950/20 pointer-events-none" />
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/90 backdrop-blur-xl shadow-2xl p-8">
          {/* Brand header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Alphonso</div>
              <div className="text-[10px] text-zinc-500">Local-first AI assistant</div>
            </div>
          </div>

          <StepIndicator currentStep={step} />

          {step === 0 && <CheckOllamaStep onNext={handleOllamaNext} />}
          {step === 1 && <PickModelStep onNext={handleModelNext} />}
          {step === 2 && <ReadyStep selectedModel={selectedModel} onFinish={handleFinish} />}
        </div>
        <div className="mt-4 text-center text-[10px] text-zinc-600">
          Local-first · Zero cloud · All data stays on your machine
        </div>
      </div>
    </div>
  );
}
