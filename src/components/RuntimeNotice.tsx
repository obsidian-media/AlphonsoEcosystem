import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

const statusColors: Record<string, string> = {
  connecting: 'amber',
  connected: 'green',
  not_running: 'red',
  disconnected: 'red',
  timeout: 'amber',
  cors: 'amber',
  error: 'red',
  idle: 'blue',
  validating: 'amber',
  ready: 'green'
};

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
}

function Badge({ children, color = 'zinc' }: BadgeProps) {
  const palette: Record<string, string> = {
    zinc: 'bg-zinc-500/10 text-zinc-300 border-zinc-400/20',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20',
    red: 'bg-red-500/10 text-red-300 border-red-400/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-400/20',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-400/20'
  };

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${palette[color] || palette.zinc}`}>{children}</span>;
}

interface RuntimeNoticeProps {
  ollamaStatus: {
    state: string;
    label: string;
    message: string;
  };
  selectedModelMissing: boolean;
  installedModels: { name: string }[];
  onRetryOllama: () => void;
  onOpenSettings: () => void;
}

export function RuntimeNotice({ ollamaStatus, selectedModelMissing, installedModels, onRetryOllama, onOpenSettings }: RuntimeNoticeProps) {
  const showNotice = ollamaStatus.state !== 'connected' || selectedModelMissing;
  if (!showNotice) return null;
  const runtimeDown = ['not_running', 'disconnected', 'timeout', 'cors'].includes(ollamaStatus.state);

  return (
    <div className="mx-6 mt-4 rounded-xl border border-white/10 bg-zinc-900/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">{selectedModelMissing ? 'Model not found' : ollamaStatus.label}</span>
            <Badge color={statusColors[ollamaStatus.state]}>{ollamaStatus.state}</Badge>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">{selectedModelMissing ? 'The selected model is not installed. Pick an installed model before sending prompts.' : ollamaStatus.message}</p>
          {installedModels.length > 0 && (
            <p className="text-[11px] text-zinc-500">Installed models: {installedModels.map((model) => model.name).join(', ')}</p>
          )}
          {runtimeDown && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-[11px] text-amber-100/85">
              <div className="font-bold uppercase tracking-widest">System Recovery</div>
              <div className="mt-1">Runtime is degraded. Use Retry first. If it stays down, open Settings, verify endpoint, and run the Ollama troubleshooting command.</div>
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col gap-2">
          <button
            onClick={onRetryOllama}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry Ollama Connection
          </button>
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}
