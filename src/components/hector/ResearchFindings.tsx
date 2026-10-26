// A research report as Hector hands it on (agent phase 1): the answer first,
// each part with its findings and their sources, disagreements, what could not
// be found, then the numbered sources with how each was read and "Save source".
import React, { useState } from 'react';
import { openSourceLink } from '../../services/browserAutomationService';
import { saveBookmark, getBookmarks } from '../../services/hectorBookmarkService';
import type { ResearchReport } from '../../services/hector/researchRun';

const LABELS = { read: 'Read', snippet: 'Snippet only', unreadable: "Couldn't read" } as const;

export function ResearchFindings({ research }: { research: ResearchReport }): React.JSX.Element {
  const [saved, setSaved] = useState<Set<string>>(() => new Set(getBookmarks().map((b) => b.url)));
  const byNumber = new Map(research.sources.map((s) => [s.n, s]));
  const cite = (n: number) => {
    const source = byNumber.get(n);
    return (
      <button key={n} type="button" title={source?.title} onClick={() => source && openSourceLink(source.url)}
        className="text-(--agent-hector) underline decoration-dotted hover:opacity-80">[{n}]</button>
    );
  };
  const save = (source: ResearchReport['sources'][number]) => {
    saveBookmark({ title: source.title, url: source.url, summary: source.excerpt.slice(0, 200), tags: ['research'] });
    setSaved(new Set(getBookmarks().map((b) => b.url)));
  };
  return (
    <div className="space-y-3 text-[12px] text-(--text-2)" data-testid="research-findings">
      <p className="text-[13px] text-(--text-1)">{research.answer}</p>
      {research.subQuestions.filter((sq) => sq.findings.length).map((sq) => (
        <div key={sq.question}>
          <div className="text-[11px] font-semibold text-(--text-1)">{sq.question}</div>
          <ul className="mt-1 space-y-1 list-disc pl-4">
            {sq.findings.map((f) => (
              <li key={f.text}>{f.text} {f.sources.map(cite)} <span className="text-(--text-3)">({f.support})</span></li>
            ))}
          </ul>
        </div>
      ))}
      {research.disagreements.length > 0 && (
        <div><div className="text-[11px] font-semibold text-(--text-1)">Sources disagree</div><ul className="list-disc pl-4">{research.disagreements.map((d) => <li key={d}>{d}</li>)}</ul></div>
      )}
      {research.notFound.length > 0 && (
        <div><div className="text-[11px] font-semibold text-(--text-1)">Could not find</div><ul className="list-disc pl-4">{research.notFound.map((d) => <li key={d}>{d}</li>)}</ul></div>
      )}
      <div>
        <div className="text-[11px] font-semibold text-(--text-1)">Sources ({research.sources.length}) · {research.rounds} round(s)</div>
        <ol className="mt-1 space-y-1">
          {research.sources.map((s) => (
            <li key={s.n} className="rounded-lg bg-(--surface-1) px-3 py-2">
              [{s.n}]{' '}
              <button type="button" onClick={() => openSourceLink(s.url)} className="text-(--agent-hector) underline break-all text-left">{s.title}</button>
              <span className="text-(--text-3)"> · {LABELS[s.label]}{s.reason ? `: ${s.reason}` : ''} · {s.kind}</span>
              <button type="button" disabled={saved.has(s.url)} onClick={() => save(s)}
                className="ml-2 rounded-sm bg-(--surface-2) px-2 py-0.5 text-[10px] disabled:opacity-40">{saved.has(s.url) ? 'Saved' : 'Save source'}</button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
