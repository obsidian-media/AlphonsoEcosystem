import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';

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
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Source Board</div>
      {sources.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">
          No sources recorded. Hector will not invent citations.
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.url} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
              <button
                type="button"
                onClick={() => openExternalUrl(source.url)}
                className="block truncate text-xs font-semibold text-teal-100 underline decoration-teal-700 hover:text-teal-50 hover:decoration-teal-400 transition-colors text-left"
                title={source.url}
              >
                {source.url}
              </button>
              <div className="mt-1 text-[11px] text-zinc-500">
                {source.type} | {source.verificationState ?? source.confidence} | {source.httpStatus ? `HTTP ${source.httpStatus}` : 'not fetched'} | expires {source.expiresAt ? new Date(source.expiresAt).toLocaleDateString() : 'n/a'}
              </div>
              {source.title && <div className="mt-2 text-xs font-semibold text-zinc-200">{source.title}</div>}
              <div className="mt-1 text-[11px] text-zinc-500">{source.error ?? source.snippet ?? source.confidenceReason}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
