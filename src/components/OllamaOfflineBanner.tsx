import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Zap } from 'lucide-react';

interface OllamaStatus {
  state: string;
}

interface OllamaOfflineBannerProps {
  ollamaStatus: OllamaStatus | null | undefined;
  onRetry?: () => void;
  onOpenRuntimes?: () => void;
}

/**
 * Global banner shown in the main app shell whenever Ollama is not connected.
 * Integrates with RuntimeManager to auto-start Ollama without leaving the app.
 */
export function OllamaOfflineBanner({ ollamaStatus, onRetry, onOpenRuntimes }: OllamaOfflineBannerProps) {
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState<string | null>(null);

  if (!ollamaStatus || ollamaStatus.state === 'connected' || ollamaStatus.state === 'connecting') return null;

  const isNotRunning = ollamaStatus.state === 'not_running' || ollamaStatus.state === 'disconnected';
  const isNoModels = ollamaStatus.state === 'no_models' || ollamaStatus.state === 'model_missing';

  const handleStart = async () => {
    setStarting(true);
    setStartMsg(null);
    try {
      const { startTool } = await import('../services/runtimeManagerService');
      const result = await startTool('ollama');
      setStartMsg(result.ok ? 'Ollama starting… retrying in 3s.' : result.message);
      if (result.ok) {
        setTimeout(() => { onRetry?.(); setStarting(false); }, 3000);
      } else {
        setStarting(false);
      }
    } catch (e) {
      setStartMsg(String(e));
      setStarting(false);
    }
  };

  return (
    <div className="w-full px-4 py-2 bg-[var(--warning-dim)] border-b border-[var(--warning-border)] flex items-center gap-3 flex-wrap">
      <AlertTriangle size={14} className="text-[var(--warning)] shrink-0" />

      <span className="text-[var(--warning)] text-xs flex-1 min-w-0">
        {isNoModels
          ? 'Ollama is running but no models are installed — open Runtime Hub to pull a model.'
          : 'Ollama is offline — AI responses are unavailable.'}
        {startMsg && <span className="ml-2 text-[var(--warning)]">{startMsg}</span>}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        {isNotRunning && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-[var(--warning)] hover:bg-[var(--warning-dim)] text-white transition-colors disabled:opacity-50"
          >
            {starting ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
            Start Ollama
          </button>
        )}
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-[var(--warning)] hover:bg-[var(--warning-dim)] transition-colors"
        >
          <RefreshCw size={10} /> Retry
        </button>
        <button
          onClick={onOpenRuntimes}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg text-[var(--warning)] hover:bg-[var(--warning-dim)] transition-colors"
        >
          <ExternalLink size={10} /> Runtime Hub
        </button>
      </div>
    </div>
  );
}
