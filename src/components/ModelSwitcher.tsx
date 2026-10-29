import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';
import { fetchOllamaModels, getConfiguredOllamaEndpoint, isChatModel, pullOllamaModel } from '../lib/ollama';

const STORAGE_KEY = 'alphonso_selected_model_v1';
// Computed per-call, not module-scoped constants — the configured endpoint
// (Settings → "Ollama API Endpoint") can change without a page reload, and a
// value captured once at import time would go stale (a real QA finding —
// these two constants ignored the setting entirely).

const AI_MODELS = ['ollama', 'claude', 'chatgpt'] as const;
type AIModel = typeof AI_MODELS[number];
const AI_MODEL_LABELS: Record<AIModel, string> = { ollama: 'Ollama', claude: 'Claude', chatgpt: 'ChatGPT' };

interface ModelSwitcherProps {
  currentModel: AIModel;
  onSwitch: (model: AIModel) => void;
  compact?: boolean;
}

export function ModelSwitcher({ currentModel, onSwitch, compact = false }: ModelSwitcherProps): React.JSX.Element {
  return (
    <div className={`flex rounded-lg overflow-hidden border border-(--border) ${compact ? 'text-xs' : 'text-sm'}`}>
      {AI_MODELS.map((model) => (
        <button key={model} onClick={() => onSwitch(model)}
          className={`${compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} transition-colors ${currentModel === model ? 'bg-(--accent) text-(--accent-contrast) font-bold' : 'bg-(--surface-3) text-(--text-3) hover:bg-(--surface-3)'}`}>
          {AI_MODEL_LABELS[model]}
        </button>
      ))}
    </div>
  );
}

interface OllamaModelPickerProps {
  onModelChange?: (name: string) => void;
  initialModel?: string;
}

export function OllamaModelPicker({ onModelChange, initialModel }: OllamaModelPickerProps): React.JSX.Element {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(() => initialModel ?? localStorage.getItem(STORAGE_KEY) ?? '');
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState('');
  const [customModel, setCustomModel] = useState('');
  const onModelChangeRef = useRef(onModelChange);
  onModelChangeRef.current = onModelChange;

  useEffect(() => {
    let cancelled = false;
    // QA 2026-10-22 (Bug 73): this asked Ollama from the window only. An
    // Ollama the user started refuses the app window, so the picker said
    // "Ollama offline" and no model could be chosen while chat worked through
    // the backend. fetchOllamaModels falls back to the backend.
    async function fetchModels() {
      try {
        const { models: listed } = await fetchOllamaModels(getConfiguredOllamaEndpoint());
        if (cancelled) return;
        // Embedding models (Echo's meaning search) can't chat, so they are not offered (QA batch 0).
        const names = listed.map((m: { name?: string; model?: string }) => m.name ?? m.model ?? '').filter(Boolean).filter(isChatModel);
        setModels(names);
        setOllamaOnline(names.length > 0);
        if (names.length > 0) {
          const stored = localStorage.getItem(STORAGE_KEY);
          const resolved = (stored && names.includes(stored)) ? stored : names[0];
          if (!stored || !names.includes(stored)) {
            setSelected(resolved);
            localStorage.setItem(STORAGE_KEY, resolved);
          }
          onModelChangeRef.current?.(resolved);
        }
      } catch {
        if (!cancelled) { setOllamaOnline(false); setModels([]); }
      }
    }
    void fetchModels();
    return () => { cancelled = true; };
  }, []);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const name = event.target.value;
    setSelected(name);
    localStorage.setItem(STORAGE_KEY, name);
    onModelChange?.(name);
  }

  async function handlePullModel() {
    const modelName = customModel.trim() || selected;
    if (!modelName) return;
    setPullingModel(modelName);
    setPullProgress('Starting download...');
    // QA 2026-10-22 (Bug 73): this pulled from the window, which an Ollama the
    // user started refuses. pullOllamaModel() goes through the backend in the
    // desktop app.
    try {
      await pullOllamaModel({
        endpoint: getConfiguredOllamaEndpoint(),
        model: modelName,
        onProgress: (p) => setPullProgress(p.percent !== null ? `${p.status} — ${p.percent}%` : p.status || 'Downloading...')
      });
      setPullProgress('Download complete');
      try {
        const { models: listed } = await fetchOllamaModels(getConfiguredOllamaEndpoint());
        // Embedding models (Echo's meaning search) can't chat, so they are not offered (QA batch 0).
        const names = listed.map((m: { name?: string; model?: string }) => m.name ?? m.model ?? '').filter(Boolean).filter(isChatModel);
        setModels(names);
        if (names.includes(modelName)) {
          setSelected(modelName);
          localStorage.setItem(STORAGE_KEY, modelName);
          onModelChangeRef.current?.(modelName);
        }
      } catch { /* ignore list refresh failure — model list stays as last successfully fetched */ }
      setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 2000);
    } catch (error) {
      setPullProgress(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 6000);
    }
  }

  const isModelPulled = models.includes(customModel.trim() || selected);
  const showPullButton = ollamaOnline && (customModel.trim() || (selected && !isModelPulled));

  if (ollamaOnline === null) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--border) rounded-lg text-[10px] text-(--text-3) font-medium uppercase tracking-widest">
        <Cpu className="w-3 h-3 shrink-0" /><span>Loading…</span>
      </div>
    );
  }

  if (!ollamaOnline) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--warning-border) rounded-lg text-[10px] text-(--warning) font-medium uppercase tracking-widest"
        title="Ollama is not running — start it to switch models">
        <Cpu className="w-3 h-3 shrink-0" /><span>Ollama offline</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex items-center gap-1 bg-(--surface-2) border border-(--border) rounded-lg px-2 py-1 hover:border-(--accent-border) transition-colors">
        <Cpu className="w-3 h-3 text-(--text-3) shrink-0 pointer-events-none" />
        <select aria-label={selected || 'Select Ollama model'} value={selected} onChange={handleChange}
          className="appearance-none bg-transparent text-[10px] text-(--text-2) font-medium uppercase tracking-widest pr-4 focus:outline-hidden cursor-pointer max-w-[140px] truncate"
          title={selected || 'Select Ollama model'}>
          {models.map((name) => <option key={name} value={name} className="bg-(--surface-2) text-(--text-2) normal-case tracking-normal">{name}</option>)}
        </select>
        <ChevronDown className="w-3 h-3 text-(--text-3) absolute right-2 pointer-events-none" />
      </div>
      {ollamaOnline && (
        <div className="flex items-center gap-1">
          <input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="model name to pull" aria-label="Model name to download"
            className="flex-1 min-w-0 bg-(--surface-2) border border-(--border) rounded-sm px-2 py-1 text-[9px] text-(--text-3) placeholder-(--text-4) focus:outline-hidden focus:border-(--accent-border)" />
          {showPullButton && (
            <button onClick={handlePullModel} disabled={!!pullingModel}
              className={`shrink-0 px-2 py-1 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-colors ${pullingModel ? 'bg-(--warning-dim) text-(--warning) cursor-wait' : 'bg-(--accent-dim) text-(--accent) hover:bg-(--accent-dim)'}`}>
              {pullingModel ? 'Pulling…' : 'Pull'}
            </button>
          )}
        </div>
      )}
      {pullProgress && <div className="text-[9px] text-(--warning) font-mono truncate" title={pullProgress}>{pullProgress}</div>}
    </div>
  );
}

// meta/llama-3.1-8b-instruct and a handful of common instruct models are
// sorted to the top of NVIDIA NIM's list when present — 70-80+ raw options
// is a UX regression, not a feature, per
// docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §4.
/**
 * NVIDIA lists models it no longer serves, so the list alone can't pick one (QA batch 1: a fixed
 * "recommended" list chose a model NVIDIA answered 404 for, and NVIDIA failed for every new user).
 * The chosen model is tried first, then the rest in name order, until one answers.
 */
function nvidiaCandidates(models: string[], selected: string): string[] {
  const rest = models.filter((m) => m !== selected).sort();
  return models.includes(selected) ? [selected, ...rest] : rest;
}

export type CloudProvider = 'nvidia_nim' | 'gemini';

interface CloudModelPickerProps {
  provider: CloudProvider;
  selectedModel: string;
  onModelChange: (name: string) => void;
}

export function CloudModelPicker({ provider, selectedModel, onModelChange }: CloudModelPickerProps): React.JSX.Element {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [notServed, setNotServed] = useState<string[]>([]);
  const [noneAnswered, setNoneAnswered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNoneAnswered(false);
    import('../services/modelSelectionService').then(({ getCloudModelList }) => getCloudModelList(provider)).then(async (list) => {
      if (cancelled) return;
      if (provider !== 'nvidia_nim') {
        setModels(list);
        setLoading(false);
        if (list.length > 0 && !list.includes(selectedModel)) onModelChange(list[0]);
        return;
      }
      const nvidia = await import('../services/connectors/nvidiaNimConnector');
      const sorted = [...list].sort();
      setModels(sorted);
      setNotServed(nvidia.nvidiaModelsNotServed());
      setLoading(false);
      setFinding(true);
      const found = await nvidia.findWorkingNvidiaModel(nvidiaCandidates(list, selectedModel));
      if (cancelled) return;
      setFinding(false);
      setNotServed(nvidia.nvidiaModelsNotServed());
      if (found.model) {
        if (found.model !== selectedModel) onModelChange(found.model);
      } else if (!found.rateLimited) {
        setNoneAnswered(true);
      }
    }).catch(() => {
      if (!cancelled) { setModels([]); setLoading(false); setFinding(false); }
    });
    return () => { cancelled = true; };
  }, [provider]);

  if (loading || finding) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--border) rounded-lg text-[10px] text-(--text-3) font-medium uppercase tracking-widest">
        <Cpu className="w-3 h-3 shrink-0" /><span>{finding ? 'Finding a model that answers…' : 'Loading models…'}</span>
      </div>
    );
  }

  if (noneAnswered) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--warning-border) rounded-lg text-[10px] text-(--warning) font-medium"
        title="NVIDIA lists these models, but none answered a test question. Try again later or check your NVIDIA key in Settings → Connectors.">
        <Cpu className="w-3 h-3 shrink-0" /><span>No NVIDIA model answered</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--warning-border) rounded-lg text-[10px] text-(--warning) font-medium uppercase tracking-widest">
        <Cpu className="w-3 h-3 shrink-0" /><span>No models available</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-1 bg-(--surface-2) border border-(--border) rounded-lg px-2 py-1 hover:border-(--accent-border) transition-colors">
      <Cpu className="w-3 h-3 text-(--text-3) shrink-0 pointer-events-none" />
      <select aria-label={selectedModel || 'Select a model'} value={selectedModel} onChange={(e) => onModelChange(e.target.value)}
        className="appearance-none bg-transparent text-[10px] text-(--text-2) font-medium uppercase tracking-widest pr-4 focus:outline-hidden cursor-pointer max-w-[180px] truncate"
        title={selectedModel || 'Select a model'}>
        {models.map((name) => {
          const gone = notServed.includes(name);
          return <option key={name} value={name} disabled={gone} className="bg-(--surface-2) text-(--text-2) normal-case tracking-normal">{gone ? `${name} (not served)` : name}</option>;
        })}
      </select>
      <ChevronDown className="w-3 h-3 text-(--text-3) absolute right-2 pointer-events-none" />
    </div>
  );
}

export type ModelProviderId = 'ollama' | CloudProvider | 'hermes';

const PROVIDER_LABELS: Record<ModelProviderId, string> = {
  ollama: 'Ollama',
  nvidia_nim: 'NVIDIA NIM',
  gemini: 'Gemini',
  hermes: 'Hermes'
};

interface HermesModelPickerProps {
  agentId: string;
  selectedModel: string;
  onModelChange: (name: string) => void;
}

/** Mirrors CloudModelPicker's shape, but the list is live from that agent's own /v1/models — never typed/guessed. */
export function HermesModelPicker({ agentId, selectedModel, onModelChange }: HermesModelPickerProps): React.JSX.Element {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    import('../services/connectors/hermesAgentConnector').then((m) => m.listHermesAgentModels(agentId)).then((list) => {
      if (cancelled) return;
      setModels(list);
      setLoading(false);
      if (list.length > 0 && !list.includes(selectedModel)) {
        onModelChange(list[0]);
      }
    }).catch((err) => {
      if (!cancelled) { setModels([]); setLoading(false); setError(err instanceof Error ? err.message : String(err)); }
    });
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--border) rounded-lg text-[10px] text-(--text-3) font-medium uppercase tracking-widest">
        <Cpu className="w-3 h-3 shrink-0" /><span>Loading models…</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-(--surface-2) border border-(--warning-border) rounded-lg text-[10px] text-(--warning) font-medium uppercase tracking-widest" title={error || undefined}>
        <Cpu className="w-3 h-3 shrink-0" /><span>{error ? 'Profile unreachable' : 'No models available'}</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-1 bg-(--surface-2) border border-(--border) rounded-lg px-2 py-1 hover:border-(--accent-border) transition-colors">
      <Cpu className="w-3 h-3 text-(--text-3) shrink-0 pointer-events-none" />
      <select aria-label={selectedModel || 'Select a model'} value={selectedModel} onChange={(e) => onModelChange(e.target.value)}
        className="appearance-none bg-transparent text-[10px] text-(--text-2) font-medium uppercase tracking-widest pr-4 focus:outline-hidden cursor-pointer max-w-[180px] truncate"
        title={selectedModel || 'Select a model'}>
        {models.map((name) => <option key={name} value={name} className="bg-(--surface-2) text-(--text-2) normal-case tracking-normal">{name}</option>)}
      </select>
      <ChevronDown className="w-3 h-3 text-(--text-3) absolute right-2 pointer-events-none" />
    </div>
  );
}

interface ModelProviderPickerProps {
  provider: ModelProviderId;
  onProviderChange: (provider: ModelProviderId) => void;
  selectedModel: string;
  onModelChange: (name: string) => void;
  ollamaPicker: React.ReactNode;
  /**
   * True while a reply is generating. The provider tabs are locked so a
   * switch cannot change which backend owns the request mid-reply.
   */
  locked?: boolean;
  /**
   * Which agent this picker controls, gating whether a Hermes tab appears
   * (via isHermesAgentConfigured(agentId)) since Hermes has no single
   * "the app's" profile, only per-agent ones. ChatView passes 'alphonso'
   * (its main chat surface IS the Alphonso agent, so Hermes is offered
   * there too, same as any other agent); the per-agent Settings UI passes
   * whichever agent's row it's rendering. Omitted entirely disables Hermes.
   */
  agentId?: string;
}

export function ModelProviderPicker({ provider, onProviderChange, selectedModel, onModelChange, ollamaPicker, agentId, locked = false }: ModelProviderPickerProps): React.JSX.Element {
  const [configured, setConfigured] = useState<Record<CloudProvider, boolean>>({ nvidia_nim: false, gemini: false });
  const [hermesConfigured, setHermesConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkConfigured = () => {
      Promise.all([
        import('../services/connectors/nvidiaNimConnector').then((m) => m.isNvidiaConfigured()),
        import('../services/connectors/geminiConnector').then((m) => m.isGeminiConfigured()),
        agentId ? import('../services/connectors/hermesAgentConnector').then((m) => m.isHermesAgentConfigured(agentId)) : Promise.resolve(false)
      ]).then(([nvidia, gemini, hermes]) => {
        if (!cancelled) { setConfigured({ nvidia_nim: nvidia, gemini }); setHermesConfigured(hermes); }
      }).catch(() => { /* leave as-is — treated as unconfigured until a successful check */ });
    };
    checkConfigured();
    // A credential saved in Settings while this component stays mounted
    // (e.g. ChatView never unmounts) wouldn't otherwise be picked up until
    // a remount — re-check whenever the window regains focus.
    window.addEventListener('focus', checkConfigured);
    // Inside the app window focus never comes back after Settings, so a saved key says so itself (QA batch 1).
    let stopListening = () => {};
    import('../services/connectors/connectorAuth')
      .then((m) => { if (cancelled) return; stopListening = m.onConnectorCredentialsChanged(checkConfigured); })
      .catch(() => { /* focus still re-checks */ });
    return () => { cancelled = true; window.removeEventListener('focus', checkConfigured); stopListening(); };
  }, [agentId]);

  const isConfigured = (id: ModelProviderId) => {
    if (id === 'ollama') return true;
    if (id === 'hermes') return hermesConfigured;
    return configured[id as CloudProvider];
  };

  const visibleProviders: ModelProviderId[] = agentId
    ? ['ollama', 'nvidia_nim', 'gemini', 'hermes']
    : ['ollama', 'nvidia_nim', 'gemini'];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex rounded-lg overflow-hidden border border-(--border) text-[9px]">
        {visibleProviders.map((id) => {
          const unconfigured = !isConfigured(id);
          const disabled = unconfigured || locked;
          return (
            <button key={id} type="button" disabled={disabled}
              onClick={() => onProviderChange(id)}
              title={unconfigured
                ? `${PROVIDER_LABELS[id]} is not configured — add ${id === 'hermes' ? 'an endpoint' : 'a key'} in Settings → Connectors`
                : locked ? 'Wait for the current reply to finish before switching provider' : PROVIDER_LABELS[id]}
              className={`px-2 py-0.5 uppercase tracking-widest font-bold transition-colors ${
                provider === id ? 'bg-(--accent) text-(--accent-contrast)' : disabled ? 'bg-(--surface-2) text-(--text-4) cursor-not-allowed' : 'bg-(--surface-3) text-(--text-3) hover:bg-(--surface-3)'
              }`}>
              {PROVIDER_LABELS[id]}
            </button>
          );
        })}
      </div>
      {provider === 'ollama' && ollamaPicker}
      {provider === 'hermes' && agentId && <HermesModelPicker agentId={agentId} selectedModel={selectedModel} onModelChange={onModelChange} />}
      {(provider === 'nvidia_nim' || provider === 'gemini') && <CloudModelPicker provider={provider} selectedModel={selectedModel} onModelChange={onModelChange} />}
    </div>
  );
}
