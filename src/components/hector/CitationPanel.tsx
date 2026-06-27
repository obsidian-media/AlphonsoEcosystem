import React from 'react';

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

export function CitationPanel({ report }: Props): JSX.Element {
  const proofs = report?.sourceProofs ?? [];
  const urls = proofs.length ? proofs.map((proof) => proof.url) : report?.urls ?? [];
  return (
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Citation Panel</div>
      {urls.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-sm text-zinc-500">
          Citation list is empty because this report has not completed a live run yet.
        </div>
      ) : (
        <ol className="space-y-2">
          {urls.map((url, index) => (
            <li key={url} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
              [{index + 1}] {url}
              {proofs[index] && (
                <div className="mt-1 text-zinc-500">
                  checked {proofs[index].dateChecked ?? 'n/a'} | {proofs[index].verificationState} | {proofs[index].httpStatus ? `HTTP ${proofs[index].httpStatus}` : 'no status'}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
