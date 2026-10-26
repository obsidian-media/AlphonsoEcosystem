// Where an Alphonso step worked (agent phase 6), so Maria, Sentinel and a fix round read the
// same files. Code artifacts are relative to this folder (a scratch program's is the output folder).
import { getJoseRequest } from '../jose/joseRequestStore';

export function stepFolder(commandId: string, stepId: string): string | null {
  const request: any = getJoseRequest(`jose-request-${commandId}`);
  const steps: any[] = request?.steps || [];
  let step = steps.find((s) => s.stepId === stepId);
  for (let hops = 0; step && hops < steps.length; hops += 1) {
    const root = step.codePreview?.place?.root || step.folder;
    if (root) return String(root);
    step = step.revises ? steps.find((s) => s.stepId === step.revises) : null;
  }
  return null;
}

/** The folder of the work a step reviews or builds on: its reviewOf step, else the first step it needs. */
export function reviewedFolder(commandId: string, assignment: { reviewOf?: string; needs?: string[] }): string | null {
  const target = assignment?.reviewOf || assignment?.needs?.[0];
  return target ? stepFolder(commandId, target) : null;
}
