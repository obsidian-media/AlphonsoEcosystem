import React from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { Zone } from '../ui/Zone';

interface SourceProof {
  url: string;
  dateChecked?: string;
  verificationState?: string;
  httpStatus?: number;
}

interface Report {
  sourceProofs?: SourceProof[];
  urls?: string[];
}

interface Props {
  report?: Report | null;
}

export function CitationPanel({ report }: Props): React.JSX.Element {
  const proofs = report?.sourceProofs ?? [];
  const urls = proofs.length ? proofs.map((proof) => proof.url) : report?.urls ?? [];
  return (
    <Zone mood="hector">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--agent-hector)]">Citations</div>
      {urls.length === 0 ? (
        <div className="rounded-xl bg-[var(--surface-1)] p-4 text-sm text-[var(--text-3)]">
          Citation list is empty because this report has not completed a live run yet.
        </div>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-[var(--text-3)]">Numbered bibliography for this report's approval handoff.</p>
          <ol className="space-y-2">
            {urls.map((url, index) => (
              <li key={url} className="rounded-xl bg-[var(--surface-1)] p-3 text-[11px] text-[var(--text-2)]">
                [{index + 1}]{' '}
                <button
                  type="button"
                  onClick={() => openExternalUrl(url)}
                  className="text-[var(--agent-hector)] underline decoration-[var(--agent-hector)] hover:decoration-[var(--agent-hector)] transition-colors break-all text-left"
                  title={url}
                >
                  {url}
                </button>
                {proofs[index] && (
                  <div className="mt-1 text-[var(--text-3)]">
                    checked {proofs[index].dateChecked ?? 'n/a'} | {proofs[index].verificationState} | {proofs[index].httpStatus ? `HTTP ${proofs[index].httpStatus}` : 'no status'}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Zone>
  );
}
