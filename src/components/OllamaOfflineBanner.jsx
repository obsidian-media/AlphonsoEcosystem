import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Zap } from 'lucide-react';
import { startTool } from '../services/runtimeManagerService';

/**
 * Global banner shown in the main app shell whenever Ollama is not connected.
 * Integrates with RuntimeManager to auto-start Ollama without leaving the app.
 */
export function OllamaOfflineBanner({ ollamaStatus, onRetry, onOpenRuntimes }) {
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState(null);

  if (!ollamaStatus || ollamaStatus.state === 'connected') return null;

  const isNotRunning = ollamaStatus.state === 'not_running' || ollamaStatus.state === 'disconnected';
  const isNoModels = ollamaStatus.state === 'no_models' || ollamaStatus.state === 'model_missing';

  const handleStart = async () => {
    setStarting(true);
    setStartMsg(null);
    try {
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
    <div className="w-full px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3 flex-wrap">
      <AlertTriangle size={14} className="text-amber-400 shrink-0" />

      <span className="text-amber-200/90 text-xs flex-1 min-w-0">
        {isNoModels
          ? 'Ollama is running but no models are installed — open Runtime Hub to pull a model.'
          : 'Ollama is offline — AI responses are unavailable.'}
        {startMsg && <span className="ml-2 text-amber-300/70">{startMsg}</span>}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        {isNotRunning && (
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
          >
            {starting ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
            Start Ollama
          </button>
        )}
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors"
        >
          <RefreshCw size={10} /> Retry
        </button>
        <button
          onClick={onOpenRuntimes}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors"
        >
          <ExternalLink size={10} /> Runtime Hub
        </button>
      </div>
    </div>
  );
}
