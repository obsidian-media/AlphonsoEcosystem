// Where an Alphonso step worked (agent phase 6), so Maria, Sentinel and a fix round read the
// same files. Code artifacts are relative to this folder (a scratch program's is the output folder).
import { requestForCommand } from '../jose/joseRequestStore';
import { listProjects, projectNamedIn } from './projects';

export function stepFolder(commandId: string, stepId: string): string | null {
  const request: any = requestForCommand(commandId);
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

// Agent roles Part C2: Alphonso's reading skills (explain code, summarise a file) read from a project.
const READING_TASKS = new Set(['assistant_explain_code', 'assistant_summarize']);

/** The folder an Alphonso reading step reads from: the project the request names, else the only one; never for other steps. */
export function readingFolder(assignment: { agent?: string; actionType?: string }, requestText: string): string | null {
  if (assignment?.agent !== 'alphonso' || !READING_TASKS.has(String(assignment?.actionType || ''))) return null;
  const projects = listProjects();
  const named = projectNamedIn(requestText, projects);
  if (named) return named.folder;
  return projects.length === 1 ? projects[0].folder : null;
}
