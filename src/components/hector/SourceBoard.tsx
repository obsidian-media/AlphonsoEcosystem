import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';

interface Source {
  url: string;
  type?: string;
  verificationState?: string;
  confidence?: string;
  httpStatus?: number;
  expiresAt?: string | number;
  title?: string;
  error?: string;
  snippet?: string;
  confidenceReason?: string;
}

interface Report {
  sources?: Source[];
}

interface Props {
  report?: Report | null;
}

export function SourceBoard({ report }: Props): React.JSX.Element {
  const sources = report?.sources ?? [];
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Discovered Sources</div>
      {sources.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          No sources recorded. Hector will not invent citations.
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.url} className="rounded-xl border border-white/10 bg-[var(--surface-1)] p-3">
              <button
                type="button"
                onClick={() => openExternalUrl(source.url)}
                className="block truncate text-xs font-semibold text-[var(--agent-hector)] underline decoration-[var(--agent-hector)] hover:decoration-[var(--agent-hector)] transition-colors text-left"
                title={source.url}
              >
                {source.url}
              </button>
              <div className="mt-1 text-[11px] text-[var(--text-3)]">
                {source.type} | {source.verificationState ?? source.confidence} | {source.httpStatus ? `HTTP ${source.httpStatus}` : 'not fetched'} | expires {source.expiresAt ? new Date(source.expiresAt).toLocaleDateString() : 'n/a'}
              </div>
              {source.title && <div className="mt-2 text-xs font-semibold text-[var(--text-2)]">{source.title}</div>}
              <div className="mt-1 text-[11px] text-[var(--text-3)]">{source.error ?? source.snippet ?? source.confidenceReason}</div>
            </div>
          ))}
        </div>
      )}
    </Zone>
  );
}
