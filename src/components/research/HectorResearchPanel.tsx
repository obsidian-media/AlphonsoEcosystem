import React from 'react';
import { Loader2, Search, CheckCircle, AlertTriangle } from 'lucide-react';
import { openExternalUrl } from '../../services/browserAutomationService';

interface ResearchSource {
  url?: string;
  title?: string;
  verificationState?: string;
}

interface ResearchBrief {
  topic?: string;
  message?: string;
  summary?: string;
  researchBackendStatus?: string;
  liveResearchAvailable?: boolean;
  confidence?: string;
  sources?: ResearchSource[];
  verifiedFacts?: string[];
}

interface Props {
  researchBrief?: ResearchBrief | null;
  loading?: boolean;
}

export function HectorResearchPanel({ researchBrief, loading = false }: Props): React.JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold mb-2">Hector Research Panel</div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-3)]">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Hector is researching sources...</span>
        </div>
      )}
      {!loading && !researchBrief && <div className="text-sm text-[var(--text-3)]">Research brief appears after workshop run.</div>}
      {!loading && researchBrief && (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            {researchBrief.researchBackendStatus === 'live' ? (
              <CheckCircle className="w-3 h-3 text-[var(--success)] shrink-0" />
            ) : researchBrief.researchBackendStatus === 'error' ? (
              <AlertTriangle className="w-3 h-3 text-[var(--warning)] shrink-0" />
            ) : (
              <Search className="w-3 h-3 text-[var(--text-3)] shrink-0" />
            )}
            <span className="text-[var(--text-2)] font-semibold">{researchBrief.topic ?? 'Research brief'}</span>
          </div>
          <div className="text-[var(--text-3)]">{researchBrief.message ?? researchBrief.summary}</div>
          <div className="text-[var(--text-3)]">
            backend: {researchBrief.researchBackendStatus} | live: {String(researchBrief.liveResearchAvailable)} | confidence: {researchBrief.confidence}
          </div>
          {researchBrief.sources && researchBrief.sources.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold">Sources ({researchBrief.sources.length})</div>
              {researchBrief.sources.slice(0, 5).map((source, idx) => (
                <div key={idx} className="flex items-center gap-1 text-[10px] text-[var(--text-3)] truncate">
                  <span className="shrink-0">{source.verificationState === 'verified' ? '✓' : '○'}</span>
                  {source.url ? (
                    <button
                      type="button"
                      onClick={() => openExternalUrl(source.url)}
                      className="truncate text-[var(--accent)] underline decoration-[var(--accent-dim)] hover:text-[var(--accent-hover)] hover:decoration-[var(--accent)] transition-colors text-left"
                      title={source.url}
                    >
                      {source.title ?? source.url}
                    </button>
                  ) : (
                    <span className="truncate">{source.title ?? 'Unknown source'}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {researchBrief.verifiedFacts && researchBrief.verifiedFacts.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold">Verified Facts</div>
              {researchBrief.verifiedFacts.slice(0, 3).map((fact, idx) => (
                <div key={idx} className="text-[10px] text-[var(--text-3)]">• {fact}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
