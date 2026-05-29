import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, Download, Sparkles, Terminal, Zap } from 'lucide-react';

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Alphonso',
    subtitle: 'Local-first AI assistant. Nothing leaves your machine.',
    icon: Sparkles,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10 border-indigo-500/20'
  },
  {
    id: 'ollama',
    title: 'Install Ollama',
    subtitle: 'Alphonso runs AI models locally through Ollama — no cloud required.',
    icon: Download,
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20'
  },
  {
    id: 'model',
    title: 'Pull a model',
    subtitle: 'Choose a local model to power your AI assistant.',
    icon: Terminal,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20'
  },
  {
    id: 'ready',
    title: "You're ready",
    subtitle: 'Alphonso is configured and ready to go.',
    icon: Zap,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10 border-amber-500/20'
  }
];

const RECOMMENDED_MODELS = [
  { name: 'llama3.2', size: '2 GB', speed: 'Fast', note: 'Recommended for most users' },
  { name: 'llama3.1:8b', size: '4.7 GB', speed: 'Balanced', note: 'Better quality, needs 8 GB RAM' },
  { name: 'mistral', size: '4 GB', speed: 'Fast', note: 'Excellent at code and reasoning' },
  { name: 'phi3.5', size: '2.2 GB', speed: 'Very fast', note: 'Great for low-end hardware' }
];

function StepIndicator({ steps, currentStep }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
            i < currentStep
              ? 'bg-emerald-500 text-white'
              : i === currentStep
                ? 'bg-indigo-500 text-white ring-2 ring-indigo-500/30'
                : 'bg-zinc-800 text-zinc-500'
          }`}>
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

function WelcomeStep({ onNext }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)] mb-6">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-3">Welcome to Alphonso</h1>
      <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mb-2">
        Your local-first AI desktop assistant. Everything runs on your machine — no subscriptions, no cloud, no data leaving your computer.
      </p>
      <p className="text-zinc-500 text-xs mb-8">This setup takes about 2 minutes.</p>
      <button
        onClick={onNext}
        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg"
      >
        Get started <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function OllamaStep({ onNext, onSkip }) {
  const [checked, setChecked] = useState(false);

  const checkOllamaRunning = async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        setChecked(true);
        setTimeout(onNext, 800);
      }
    } catch {
      // Not running yet
    }
  };

  useEffect(() => {
    checkOllamaRunning();
    const interval = setInterval(checkOllamaRunning, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col">
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Step 1 — Install Ollama</div>
        <p className="text-sm text-zinc-300 mb-4">
          Ollama runs AI models locally on your machine. Download and install it, then come back.
        </p>
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white text-xs font-bold rounded-xl transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Download Ollama for Windows
        </a>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5 mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Step 2 — Start Ollama</div>
        <p className="text-xs text-zinc-400 mb-3">After installing, open a terminal and run:</p>
        <div className="font-mono text-xs bg-black/40 border border-white/5 rounded-lg px-4 py-3 text-emerald-400 select-all">
          ollama serve
        </div>
      </div>

      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 mb-6 transition-all ${
        checked
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-white/[0.06] bg-zinc-900/40'
      }`}>
        <div className={`w-2 h-2 rounded-full ${checked ? 'bg-emerald-400' : 'bg-zinc-600 animate-pulse'}`} />
        <span className={`text-xs font-semibold ${checked ? 'text-emerald-300' : 'text-zinc-400'}`}>
          {checked ? 'Ollama detected — continuing...' : 'Waiting for Ollama to start...'}
        </span>
      </div>

      <div className="flex justify-between">
        <button onClick={onSkip} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Skip for now
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function ModelStep({ onNext, onSkip }) {
  const [copied, setCopied] = useState('');

  const copy = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="flex flex-col">
      <p className="text-sm text-zinc-400 mb-4">
        Run one of these commands in your terminal to pull a model. Alphonso will detect it automatically.
      </p>

      <div className="space-y-2 mb-6">
        {RECOMMENDED_MODELS.map((model) => (
          <div
            key={model.name}
            className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-zinc-900/60 px-4 py-3"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-zinc-100">{model.name}</span>
                <span className="text-[10px] text-zinc-500 font-medium">{model.size} · {model.speed}</span>
              </div>
              <span className="text-[11px] text-zinc-500">{model.note}</span>
            </div>
            <button
              onClick={() => copy(`ollama pull ${model.name}`)}
              className="shrink-0 ml-3 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-lg transition-colors"
            >
              {copied === `ollama pull ${model.name}` ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button onClick={onSkip} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Skip — I already have a model
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors"
        >
          Continue <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function ReadyStep({ onFinish }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
        <Zap className="w-8 h-8 text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-3">You're all set</h2>
      <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mb-2">
        Alphonso is ready. Select a model in Settings, then start chatting.
      </p>
      <p className="text-zinc-500 text-xs mb-8">
        Open Settings with <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-white/10 rounded text-zinc-300 font-mono text-[10px]">Ctrl + ,</kbd> at any time.
      </p>
      <button
        onClick={onFinish}
        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg"
      >
        Open Alphonso <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const finish = () => {
    localStorage.setItem('alphonso_onboarding_complete', 'true');
    onComplete();
  };

  const stepContent = [
    <WelcomeStep key="welcome" onNext={next} />,
    <OllamaStep key="ollama" onNext={next} onSkip={next} />,
    <ModelStep key="model" onNext={next} onSkip={next} />,
    <ReadyStep key="ready" onFinish={finish} />
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/30 via-transparent to-cyan-950/20 pointer-events-none" />
      <div className="relative w-full max-w-md mx-4">
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/90 backdrop-blur-xl shadow-2xl p-8">
          <StepIndicator steps={STEPS} currentStep={step} />
          {stepContent[step]}
        </div>
        <div className="mt-4 text-center text-[10px] text-zinc-600">
          Local-first · Zero cloud · All data stays on your machine
        </div>
      </div>
    </div>
  );
}
