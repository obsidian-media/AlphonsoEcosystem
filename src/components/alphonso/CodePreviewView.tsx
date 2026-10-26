import React from 'react';
import type { CodePreview } from '../../services/alphonso/types';

const counts = (added: number, removed: number) => [added ? `+${added}` : '', removed ? `−${removed}` : ''].filter(Boolean).join(' ');

/** Alphonso's prepared change (agent phase 6): what changes and runs if you approve. */
export function CodePreviewView({ preview }: { preview: CodePreview }): React.JSX.Element {
  return (
    <div data-testid="alphonso-code-preview" className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs text-(--text-2)">
      <div className="font-semibold text-(--text-1)">In {preview.place.name}: {preview.plan || preview.title}</div>
      {preview.files.map((file) => (
        <div key={file.path} className="space-y-0.5">
          <div>
            <span className="font-mono text-(--text-1)">{file.path}</span>{' '}
            <span className="text-(--text-3)">{file.status === 'new' ? 'new' : 'changed'} {counts(file.added, file.removed)}</span>
          </div>
          {file.firstDiff.length > 0 && (
            <pre className="whitespace-pre-wrap rounded-md bg-(--surface-1) p-2 font-mono text-[11px] text-(--text-2)">{file.firstDiff.join('\n')}</pre>
          )}
        </div>
      ))}
      {preview.commands.map((command, i) => (
        <div key={`${command.program}-${i}`}>
          <span className="font-mono text-(--text-1)">{[command.program, ...command.args].join(' ')}</span>
          {command.why ? <span> — {command.why}</span> : null}
          {command.readOnly ? <span className="text-(--text-3)"> (runs without asking)</span> : null}
        </div>
      ))}
      {preview.dropped.map((d) => (
        <div key={d.path} className="text-(--warning)">{`${d.path}: ${d.reason}`}</div>
      ))}
      <div className="text-(--text-3)">{`Model: ${preview.model || "Alphonso's own"}`}</div>
    </div>
  );
}
