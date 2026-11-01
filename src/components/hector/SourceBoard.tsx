import React from 'react';
import { openSourceLink } from '../../services/browserAutomationService';
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

/**
 * A page's text, or "Couldn't read this page." when it is mostly not text: reports saved before
 * 2.11.1 hold compressed bytes as some pages' text (2.11.0 QA, owner 2026-11-01).
 */
export function readableText(value: string | undefined): string | undefined {
  if (!value) return value;
  const chars = [...value];
  // eslint-disable-next-line no-control-regex
  const bad = chars.filter((c) => c === '\uFFFD' || /[\u0000-\u0008\u000E-\u001F]/.test(c)).length;
  return bad * 20 > chars.length ? "Couldn't read this page." : value;
}

export function SourceBoard({ report }: Props): React.JSX.Element {
  const sources = report?.sources ?? [];
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-(--agent-hector)">Discovered Sources</div>
      {sources.length === 0 ? (
        <div className="rounded-xl bg-(--surface-1) p-4 text-sm text-(--text-3)">
          No sources recorded. Hector will not invent citations.
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.url} className="rounded-xl bg-(--surface-1) p-3">
              <button
                type="button"
                onClick={() => openSourceLink(source.url)}
                className="block truncate text-xs font-semibold text-(--agent-hector) underline decoration-(--agent-hector) hover:decoration-(--agent-hector) transition-colors text-left"
                title={source.url}
              >
                {source.url}
              </button>
              <div className="mt-1 text-[11px] text-(--text-3)">
                {[source.type, source.verificationState ?? source.confidence, source.httpStatus ? `HTTP ${source.httpStatus}` : 'Not opened', source.expiresAt ? `expires ${new Date(source.expiresAt).toLocaleDateString()}` : '']
                  .filter(Boolean).join(' · ')}
              </div>
              {source.title && <div className="mt-2 text-xs font-semibold text-(--text-2)">{source.title}</div>}
              <div className="mt-1 text-[11px] text-(--text-3)">{readableText(source.error ?? source.snippet ?? source.confidenceReason)}</div>
            </div>
          ))}
        </div>
      )}
    </Zone>
  );
}
