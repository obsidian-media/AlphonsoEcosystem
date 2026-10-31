import React, { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { getConfiguredOllamaEndpoint, pullOllamaModel, PREFERRED_MODEL } from '../lib/ollama';
import { openExternalUrl } from '../services/browserAutomationService';

// Ollama's own list of models; Alphonso keeps no list of model names (QA, 2026-10-31).
const OLLAMA_LIBRARY_URL = 'https://ollama.com/library';

/**
 * Settings → General: download a model by name, inside the app, with progress.
 * Until 2026-10-31 this offered a fixed list of old model names and asked you to
 * paste an `ollama pull` command into a terminal.
 */
export function ModelPullHelper({ onRefresh }: { onRefresh: () => void }): React.JSX.Element {
  const [modelName, setModelName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function download() {
    const model = modelName.trim();
    if (!model || busy) return;
    setBusy(true);
    setProgress('Starting download…');
    try {
      await pullOllamaModel({
        endpoint: getConfiguredOllamaEndpoint(),
        model,
        onProgress: (p) => setProgress(p.percent !== null && p.percent !== undefined ? `${p.status} — ${p.percent}%` : p.status || 'Downloading…'),
      });
      setProgress(`Downloaded ${model}.`);
      onRefresh();
    } catch (error) {
      setProgress(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-(--surface-2) p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-3)">Download a model</div>
      <div className="flex gap-2">
        <input
          aria-label="Model name"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void download(); }}
          placeholder={`Model name, e.g. ${PREFERRED_MODEL}`}
          className="flex-1 bg-(--surface-3) rounded-xl px-3 py-2 text-sm font-mono text-(--text-1) placeholder-(--text-4) focus:outline-hidden focus:border-(--accent-border)"
        />
        <button
          onClick={() => void download()}
          disabled={!modelName.trim() || busy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-(--surface-3) border-(--border) text-(--text-2) hover:bg-(--surface-3)"
        >
          <Download className="w-3.5 h-3.5" /> {busy ? 'Downloading…' : 'Download'}
        </button>
      </div>
      {progress && <div className="text-[11px] text-(--text-2)" role="status">{progress}</div>}
      <p className="text-[11px] text-(--text-4)">
        Find a model in{' '}
        <button type="button" onClick={() => void openExternalUrl(OLLAMA_LIBRARY_URL)} className="inline-flex items-center gap-1 text-(--accent) hover:text-(--accent-hover) underline">
          Ollama's model library <ExternalLink className="w-3 h-3" />
        </button>
        , then type its name here. Models under 3B work but give weaker answers.
      </p>
    </div>
  );
}
