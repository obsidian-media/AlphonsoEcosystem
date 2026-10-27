import React, { useEffect, useState } from 'react';
import { ECHO_EMBED_MODEL, ensureMeaning, meaningState, onMeaningState, type MeaningState } from '../../services/echo/meaning';

function words(s: MeaningState): string {
  switch (s.kind) {
    case 'off': return 'Off.';
    case 'no_ollama': return 'Needs Ollama running.';
    case 'downloading': return `Downloading the meaning model (${ECHO_EMBED_MODEL}, 46 MB)${s.pct == null ? '…' : `: ${Math.round(s.pct)}%`}`;
    case 'indexing': return `Reading your decisions: ${s.done} of ${s.total}`;
    case 'ready': return 'On.';
    case 'failed': return `Couldn't get the meaning model: ${s.reason.replace(/\.$/, '')}. Word search is used.`;
  }
}

/** Settings → Memory (agent roles Part C2): Echo's meaning search, its switch and its state. */
export function MeaningSearchStatus({ settings, setSettings }: { settings: Record<string, any>; setSettings: (next: any) => void }): React.JSX.Element {
  const [state, setState] = useState<MeaningState>(meaningState());
  useEffect(() => onMeaningState(setState), []);
  const on = settings?.echoMeaningSearch !== false;
  const toggle = () => {
    setSettings({ ...settings, echoMeaningSearch: !on });
    if (!on) void ensureMeaning();
  };
  return (
    <div className="space-y-1 rounded-xl bg-(--surface-2) p-3 text-xs text-(--text-2)">
      <label className="flex items-center gap-2 text-(--text-1)">
        <input type="checkbox" checked={on} onChange={toggle} aria-label="Match decisions by meaning" />
        Match decisions by meaning
      </label>
      <p>Echo also finds decisions worded differently, with a small model on this computer. Word search works without it.</p>
      <p data-testid="echo-meaning-status">{on ? words(state) : 'Off.'}</p>
    </div>
  );
}
