// Editing Alphonso's change before you approve it (agent roles Part C2, owner 2026-10-26): what you
// save is what gets written, marked "edited by you". The file's old-content check stays, so a file
// that changed on disk since the preview is still refused. One approval, as before.
import { getJoseRequest, updateJoseStep } from '../jose/joseRequestStore';
import { classifyFile } from './changeSet';
import type { CodePreview } from './types';

export const EDIT_TOO_LATE = 'This change has already been approved or rejected.';
export const EDIT_NOT_IN_CHANGE = 'That file is not part of this change.';

export function editCodeFile(requestId: string, stepId: string, path: string, content: string): { ok: true } | { ok: false; reason: string } {
  const step: any = getJoseRequest(requestId)?.steps.find((s) => s.stepId === stepId);
  const preview: CodePreview | undefined = step?.codePreview;
  if (!step || !preview || step.status !== 'waiting_approval') return { ok: false, reason: EDIT_TOO_LATE };
  const file = preview.files.find((f) => f.path === path);
  if (!file) return { ok: false, reason: EDIT_NOT_IN_CHANGE };
  const redone = classifyFile(path, String(content), file.before ?? null);
  const edited = { ...redone, beforeHash: file.beforeHash, editedByYou: true };
  const next: CodePreview = { ...preview, edited: true, files: preview.files.map((f) => (f.path === path ? edited : f)) };
  updateJoseStep(requestId, stepId, { codePreview: next } as never);
  return { ok: true };
}
