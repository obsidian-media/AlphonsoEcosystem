// The top right's model badge (2.11.0 QA, owner 2026-11-01): the provider and model Chat uses
// (it showed the Ollama model while Chat used OpenRouter), and, when clicked, each agent's.
import React, { useEffect, useRef, useState } from 'react';
import { listAgentProfiles } from '../agents/agentRegistry';
import { getAgentProvider } from '../services/modelSelectionService';

const PROVIDER_NAMES: Record<string, string> = {
  ollama: 'Ollama', nvidia_nim: 'NVIDIA NIM', gemini: 'Gemini', openrouter: 'OpenRouter', hermes: 'Hermes',
};

interface Props {
  settings: { selectedProvider?: string; selectedModel?: string };
  ollamaState: string;
  selectedModelMissing?: boolean;
}

export function ActiveModelBadge({ settings, ollamaState, selectedModelMissing }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const provider = settings.selectedProvider || 'ollama';
  const isOllama = provider === 'ollama';
  const missing = isOllama && selectedModelMissing;
  const model = missing ? 'No model' : settings.selectedModel || 'No model';
  const healthy = isOllama ? ollamaState === 'connected' : Boolean(settings.selectedModel);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const rows = open ? listAgentProfiles().map((agent: { id: string; name: string }) => {
    const config = getAgentProvider(agent.id);
    const line = config.provider === 'paid'
      ? 'Paid model (asks first)'
      : `${PROVIDER_NAMES[config.provider] || config.provider} · ${config.model || (config.provider === 'ollama' ? settings.selectedModel || 'default model' : 'default model')}`;
    return { id: agent.id, name: agent.name, line };
  }) : [];

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Models in use"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-(--surface-2) border ${missing ? 'border-(--warning-border)' : 'border-(--border)'} hover:border-(--accent-border)`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${healthy ? 'bg-(--success)' : 'bg-(--error)'}`} />
        <span data-testid="active-model" className={`text-xs ${missing ? 'text-(--warning)' : 'text-(--text-3)'}`}>
          {`${PROVIDER_NAMES[provider] || provider} · ${model}`}
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label="Models in use" className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-(--border) bg-(--surface-1) p-2 shadow-lg">
          <p className="px-1 pb-1 text-[10px] uppercase tracking-widest text-(--text-4)">Chat uses the model above. Agents:</p>
          {rows.map((row) => (
            <div key={row.id} data-testid={`agent-model-${row.id}`} className="flex justify-between gap-2 px-1 py-0.5 text-xs">
              <span className="text-(--text-1)">{row.name}</span>
              <span className="text-(--text-3) truncate text-right">{row.line}</span>
            </div>
          ))}
          <p className="px-1 pt-1 text-[10px] text-(--text-4)">Change them in Settings → Agents.</p>
        </div>
      )}
    </div>
  );
}
