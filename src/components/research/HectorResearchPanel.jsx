import React from 'react';

export function HectorResearchPanel({ researchBrief }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Hector Research Panel</div>
      {!researchBrief && <div className="text-sm text-zinc-500">Research brief appears after workshop run.</div>}
      {researchBrief && (
        <div className="space-y-2 text-xs">
          <div className="text-zinc-200 font-semibold">{researchBrief.topic || 'Research brief'}</div>
          <div className="text-zinc-400">{researchBrief.message}</div>
          <div className="text-zinc-500">
            backend: {researchBrief.researchBackendStatus} | live: {String(researchBrief.liveResearchAvailable)}
          </div>
        </div>
      )}
    </div>
  );
}

