import React, { useState } from 'react';
import type { CodePreview } from '../../services/alphonso/types';
import { Button } from '../ui';

const counts = (added: number, removed: number) => [added ? `+${added}` : '', removed ? `−${removed}` : ''].filter(Boolean).join(' ');

/** Alphonso's prepared change (agent phase 6): what changes and runs if you approve. With `onEdit`
 *  (agent roles Part C2) each file can be edited first; what you save is what gets written. */
export function CodePreviewView({ preview, onEdit }: {
  preview: CodePreview;
  onEdit?: (path: string, content: string) => { ok: boolean; reason?: string };
}): React.JSX.Element {
  const [editing, setEditing] = useState<{ path: string; text: string } | null>(null);
  const [problem, setProblem] = useState('');
  const save = () => {
    if (!editing || !onEdit) return;
    const out = onEdit(editing.path, editing.text);
    if (out.ok) { setEditing(null); setProblem(''); } else setProblem(out.reason || 'The change could not be saved.');
  };
  return (
    <div data-testid="alphonso-code-preview" className="space-y-2 rounded-xl bg-(--surface-2) p-3 text-xs text-(--text-2)">
      <div className="font-semibold text-(--text-1)">In {preview.place.name}: {preview.plan || preview.title}</div>
      {preview.files.map((file) => (
        <div key={file.path} className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-(--text-1)">{file.path}</span>
            <span className="text-(--text-3)">{file.status === 'new' ? 'new' : 'changed'} {counts(file.added, file.removed)}</span>
            {file.editedByYou && <span className="text-(--accent)">Edited by you</span>}
            {onEdit && editing?.path !== file.path && (
              <Button variant="ghost" data-testid={`alphonso-edit-${file.path}`} onClick={() => { setEditing({ path: file.path, text: file.content }); setProblem(''); }}>Edit</Button>
            )}
          </div>
          {editing?.path === file.path ? (
            <div className="space-y-1">
              <textarea
                aria-label={`Edit ${file.path}`}
                className="h-48 w-full rounded-md bg-(--surface-1) p-2 font-mono text-[11px] text-(--text-1)"
                value={editing.text}
                onChange={(e) => setEditing({ path: file.path, text: e.target.value })}
              />
              <div className="flex gap-2">
                <Button variant="primary" data-testid="alphonso-edit-save" onClick={save}>Save</Button>
                <Button variant="ghost" onClick={() => { setEditing(null); setProblem(''); }}>Cancel</Button>
              </div>
            </div>
          ) : file.firstDiff.length > 0 && (
            <pre className="whitespace-pre-wrap rounded-md bg-(--surface-1) p-2 font-mono text-[11px] text-(--text-2)">{file.firstDiff.join('\n')}</pre>
          )}
        </div>
      ))}
      {problem && <div className="text-(--warning)">{problem}</div>}
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
