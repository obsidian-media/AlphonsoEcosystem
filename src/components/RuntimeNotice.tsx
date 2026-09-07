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
    zinc: 'bg-[var(--surface-3)] text-[var(--text-2)] border-[var(--border)]',
    green: 'bg-[var(--success-dim)] text-[var(--success)] border-[var(--success-border)]',
    red: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
    amber: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
    blue: 'bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]'
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
    <div className="mx-6 mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--warning)]" />
            <span className="text-sm font-semibold text-[var(--text-1)]">{selectedModelMissing ? 'Model not found' : ollamaStatus.label}</span>
            <Badge color={statusColors[ollamaStatus.state]}>{ollamaStatus.state}</Badge>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-3)]">{selectedModelMissing ? 'The selected model is not installed. Pick an installed model before sending prompts.' : ollamaStatus.message}</p>
          {installedModels.length > 0 && (
            <p className="text-[11px] text-[var(--text-3)]">Installed models: {installedModels.map((model) => model.name).join(', ')}</p>
          )}
          {runtimeDown && (
            <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-dim)] p-3 text-[11px] text-[var(--warning)]">
              <div className="font-bold uppercase tracking-widest">System Recovery</div>
              <div className="mt-1">Runtime is degraded. Use Retry first. If it stays down, open Settings, verify endpoint, and run the Ollama troubleshooting command.</div>
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col gap-2">
          <button
            onClick={onRetryOllama}
            className="flex items-center gap-2 rounded-lg bg-[var(--surface-3)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-3)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry Ollama Connection
          </button>
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-bold text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}
