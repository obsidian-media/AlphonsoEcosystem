import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';

const STORAGE_KEY = 'alphonso_selected_model_v1';
const OLLAMA_TAGS_URL = 'http://localhost:11434/api/tags';
const FETCH_TIMEOUT_MS = 3000;

const AI_MODELS = ['ollama', 'claude', 'chatgpt'];
const AI_MODEL_LABELS = { ollama: 'Ollama', claude: 'Claude', chatgpt: 'ChatGPT' };

export function ModelSwitcher({ currentModel, onSwitch, compact = false }) {
  return (
    <div className={`flex rounded-lg overflow-hidden border border-zinc-700 ${compact ? 'text-xs' : 'text-sm'}`}>
      {AI_MODELS.map((model) => (
        <button
          key={model}
          onClick={() => onSwitch(model)}
          className={`${compact ? 'px-2 py-0.5' : 'px-3 py-1.5'} transition-colors ${
            currentModel === model
              ? 'bg-amber-500 text-black font-bold'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          {AI_MODEL_LABELS[model]}
        </button>
      ))}
    </div>
  );
}

export function OllamaModelPicker({ onModelChange, initialModel }) {
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState(
    () => initialModel || localStorage.getItem(STORAGE_KEY) || ''
  );
  const [ollamaOnline, setOllamaOnline] = useState(null);
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
        const data = await resp.json();
        if (cancelled) return;
        const names = Array.isArray(data?.models)
          ? data.models.map((m) => m.name || m.model).filter(Boolean)
          : [];
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
        if (!cancelled) {
          setOllamaOnline(false);
          setModels([]);
        }
      }
    }

    void fetchModels();
    return () => { cancelled = true; };
  }, []);

  function handleChange(event) {
    const name = event.target.value;
    setSelected(name);
    localStorage.setItem(STORAGE_KEY, name);
    onModelChange?.(name);
  }

  if (ollamaOnline === null) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-500 font-medium uppercase tracking-widest">
        <Cpu className="w-3 h-3 shrink-0" />
        <span>Loading…</span>
      </div>
    );
  }

  if (!ollamaOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-amber-500/20 rounded-lg text-[10px] text-amber-400 font-medium uppercase tracking-widest"
        title="Ollama is not running — start it to switch models"
      >
        <Cpu className="w-3 h-3 shrink-0" />
        <span>Ollama offline</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-1 bg-zinc-900 border border-white/5 rounded-lg px-2 py-1 hover:border-indigo-500/30 transition-colors">
      <Cpu className="w-3 h-3 text-zinc-500 shrink-0 pointer-events-none" />
      <select
        value={selected}
        onChange={handleChange}
        className="appearance-none bg-transparent text-[10px] text-zinc-300 font-medium uppercase tracking-widest pr-4 focus:outline-none cursor-pointer max-w-[140px] truncate"
        title={selected || 'Select Ollama model'}
      >
        {models.map((name) => (
          <option key={name} value={name} className="bg-zinc-900 text-zinc-200 normal-case tracking-normal">
            {name}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 pointer-events-none" />
    </div>
  );
}
