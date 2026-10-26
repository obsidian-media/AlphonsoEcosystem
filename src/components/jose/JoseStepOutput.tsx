// What a step of a Jose request produced (phase 6a, QA Bug 4): its summary,
// the files it wrote, its sources, and its structured result as text. Shown
// on the Requests board when you pick a step in the map.
import React, { useMemo, useState } from 'react';
import { getStepOutput } from '../../services/jose/joseStepOutputs';
import { openSourceLink } from '../../services/browserAutomationService';
import { ResearchFindings } from '../hector/ResearchFindings';
import { toReadableText } from '../../lib/readableValue';

const TEXT_LIMIT = 2000;

function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function JoseStepOutput({ commandId, stepId }: { commandId: string; stepId: string }) {
  const [showAll, setShowAll] = useState(false);
  const output: any = useMemo(() => getStepOutput(commandId, stepId), [commandId, stepId]);
  if (!output) {
    return <p className="text-xs text-(--text-3)">Nothing was saved for this step.</p>;
  }
  // Hector's cited report (agent phase 1): the answer, findings with sources, Save source.
  const research: any = output.schema;
  if (research && typeof research.answer === 'string' && Array.isArray(research.sources) && Array.isArray(research.subQuestions)) {
    return <div className="text-xs" data-testid="jose-step-output"><ResearchFindings research={research} /></div>;
  }
  const artifacts: any[] = Array.isArray(output.artifacts) ? output.artifacts : [];
  const files = artifacts
    .map((a) => String(a?.path || a?.relativePath || a?.filePath || ''))
    .filter(Boolean);
  const sources: any[] = (Array.isArray(output.sources) ? output.sources : []).filter((s) => s?.url || s?.title);
  const body = output.schema ?? artifacts.find((a) => a?.data !== undefined)?.data ?? null;
  const text = body === null ? '' : toReadableText(body).trim();
  const long = text.length > TEXT_LIMIT;

  return (
    <div className="space-y-2 text-xs text-(--text-2)" data-testid="jose-step-output">
      {output.summary && <p className="text-sm text-(--text-1)">{String(output.summary)}</p>}
      {files.length > 0 && (
        <div>
          <div className="text-(--text-3)">Files written</div>
          <ul className="list-disc pl-4">{files.map((f) => <li key={f} title={f}>{fileName(f)}</li>)}</ul>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <div className="text-(--text-3)">Sources</div>
          <ul className="list-disc pl-4">
            {sources.map((s, i) => (
              <li key={`${s.url || s.title}-${i}`}>
                {s.url
                  ? <button type="button" title={s.url} className="text-left underline" onClick={() => { openSourceLink(s.url); }}>{s.title || s.url}</button>
                  : s.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {text && (
        <div>
          <pre data-testid="jose-step-output-text" className="whitespace-pre-wrap rounded-lg bg-(--surface-1) p-2 text-(--text-1)">
            {long && !showAll ? `${text.slice(0, TEXT_LIMIT)}…` : text}
          </pre>
          {long && (
            <button type="button" className="text-(--accent) underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : 'Show all'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
