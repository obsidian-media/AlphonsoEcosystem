import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';

const STORAGE_KEY = 'alphonso_selected_model_v1';
const OLLAMA_TAGS_URL = 'http://localhost:11434/api/tags';
const OLLAMA_PULL_URL = 'http://localhost:11434/api/pull';
const FETCH_TIMEOUT_MS = 3000;

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
    <div className={`flex rounded-lg overflow-hidden border border-zinc-700 ${compact ? 'text-xs' : 'text-sm'}`}>
      {AI_MODELS.map((model) => (
        <button key={model} onClick={() => onSwitch(model)}
          className={`${compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} transition-colors ${currentModel === model ? 'bg-amber-500 text-black font-bold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
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
    async function fetchModels() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const resp = await fetch(OLLAMA_TAGS_URL, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json() as { models?: { name?: string; model?: string }[] };
        if (cancelled) return;
        const names = Array.isArray(data?.models) ? data.models.map((m) => m.name ?? m.model ?? '').filter(Boolean) : [];
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
        clearTimeout(timer);
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
    try {
      const res = await fetch(OLLAMA_PULL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      });
      if (!res.ok) {
        setPullProgress(`Error: HTTP ${res.status}`);
        setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 3000);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as { status?: string; total?: number; completed?: number };
            if (data.status) {
              const parts = [data.status];
              if (data.total && data.completed) parts.push(`${Math.round((data.completed / data.total) * 100)}%`);
              setPullProgress(parts.join(' — '));
            }
          } catch { }
        }
      }
      setPullProgress('Download complete');
      try {
        const tagRes = await fetch(OLLAMA_TAGS_URL);
        if (tagRes.ok) {
          const tagData = await tagRes.json() as { models?: { name?: string; model?: string }[] };
          const names = Array.isArray(tagData?.models) ? tagData.models.map((m) => m.name ?? m.model ?? '').filter(Boolean) : [];
          setModels(names);
          if (names.includes(modelName)) {
            setSelected(modelName);
            localStorage.setItem(STORAGE_KEY, modelName);
            onModelChangeRef.current?.(modelName);
          }
        }
      } catch { }
      setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 2000);
    } catch {
      setPullProgress('Could not reach Ollama');
      setTimeout(() => { setPullingModel(null); setPullProgress(''); }, 3000);
    }
  }

  const isModelPulled = models.includes(customModel.trim() || selected);
  const showPullButton = ollamaOnline && (customModel.trim() || (selected && !isModelPulled));

  if (ollamaOnline === null) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-500 font-medium uppercase tracking-widest">
        <Cpu className="w-3 h-3 shrink-0" /><span>Loading…</span>
      </div>
    );
  }

  if (!ollamaOnline) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-amber-500/20 rounded-lg text-[10px] text-amber-400 font-medium uppercase tracking-widest"
        title="Ollama is not running — start it to switch models">
        <Cpu className="w-3 h-3 shrink-0" /><span>Ollama offline</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex items-center gap-1 bg-zinc-900 border border-white/5 rounded-lg px-2 py-1 hover:border-indigo-500/30 transition-colors">
        <Cpu className="w-3 h-3 text-zinc-500 shrink-0 pointer-events-none" />
        <select value={selected} onChange={handleChange}
          className="appearance-none bg-transparent text-[10px] text-zinc-300 font-medium uppercase tracking-widest pr-4 focus:outline-none cursor-pointer max-w-[140px] truncate"
          title={selected || 'Select Ollama model'}>
          {models.map((name) => <option key={name} value={name} className="bg-zinc-900 text-zinc-200 normal-case tracking-normal">{name}</option>)}
        </select>
        <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 pointer-events-none" />
      </div>
      {ollamaOnline && (
        <div className="flex items-center gap-1">
          <input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="model name to pull"
            className="flex-1 min-w-0 bg-zinc-900 border border-white/5 rounded px-2 py-1 text-[9px] text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/30" />
          {showPullButton && (
            <button onClick={handlePullModel} disabled={!!pullingModel}
              className={`shrink-0 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${pullingModel ? 'bg-amber-500/20 text-amber-400 cursor-wait' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}>
              {pullingModel ? 'Pulling…' : 'Pull'}
            </button>
          )}
        </div>
      )}
      {pullProgress && <div className="text-[9px] text-amber-400 font-mono truncate" title={pullProgress}>{pullProgress}</div>}
    </div>
  );
}
