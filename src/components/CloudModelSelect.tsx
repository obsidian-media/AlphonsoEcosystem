import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getConnectorCredential, saveConnectorCredential } from '../services/connectors/connectorAuth';
import { CLAUDE_DEFAULT_MODEL, listClaudeModels } from '../services/claudeService';
import { OPENAI_DEFAULT_MODEL, listOpenAiModels } from '../services/chatgptService';

type Provider = 'claude' | 'chatgpt';

const SETUP: Record<Provider, { key: string; fallback: string; list: () => Promise<{ ok: boolean; models: string[]; error?: string }> }> = {
  claude: { key: 'CLAUDE_MODEL', fallback: CLAUDE_DEFAULT_MODEL, list: () => listClaudeModels() },
  chatgpt: { key: 'OPENAI_MODEL', fallback: OPENAI_DEFAULT_MODEL, list: () => listOpenAiModels() },
};

/**
 * Choose the Claude or ChatGPT model from the provider's own live list
 * (owner, 2026-10-22: the user chooses; nothing is a fixed list in the code).
 * "Default" uses the preselected model only when nothing is chosen. If the
 * list can't be loaded, a model name can be typed instead.
 */
export function CloudModelSelect({ provider }: { provider: Provider }) {
  const { key, fallback, list } = SETUP[provider];
  const [chosen, setChosen] = useState(() => getConnectorCredential(provider, key));
  const [models, setModels] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setModels(null);
    setError('');
    const result = await list();
    if (result.ok) setModels(result.models);
    else { setModels([]); setError(result.error || 'Could not load the model list.'); }
  }, [list]);

  useEffect(() => { void load(); }, [load]);

  const choose = (value: string) => {
    setChosen(value);
    saveConnectorCredential(provider, key, value);
  };

  const id = `${provider}-model`;
  const options = models && chosen && !models.includes(chosen) ? [chosen, ...models] : models;

  return (
    <div className="mt-2 space-y-1" data-testid={`cloud-model-${provider}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[11px] font-semibold text-(--text-2)">Model</label>
        <button onClick={() => void load()} aria-label="Reload the model list" className="inline-flex items-center gap-1 text-[11px] text-(--text-3) hover:text-(--text-1)">
          <RefreshCw className="h-3 w-3" /> Reload
        </button>
      </div>
      {models === null && <div className="text-[11px] text-(--text-4)">Loading models…</div>}
      {options && options.length > 0 && (
        <select
          id={id}
          value={chosen}
          onChange={(e) => choose(e.target.value)}
          className="w-full rounded-xl bg-(--surface-2) px-3 py-2 text-sm text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
        >
          <option value="">Default ({fallback})</option>
          {options.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      {models !== null && models.length === 0 && (
        <div className="space-y-1">
          {error && <div className="text-[11px] text-(--text-3)">{error} You can type a model name instead.</div>}
          <input
            id={id}
            value={chosen}
            onChange={(e) => choose(e.target.value)}
            placeholder={`${fallback} (default)`}
            className="w-full rounded-xl bg-(--surface-2) px-3 py-2 text-sm font-mono text-(--text-1) placeholder-(--text-4)"
          />
        </div>
      )}
    </div>
  );
}
