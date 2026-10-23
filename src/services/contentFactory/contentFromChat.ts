// A content video asked for in Chat becomes a Miya Studio project (phase 6b,
// owner 2026-10-23): your default brand, the idea from your message, and Jose
// runs it as one request. The run goes on in the background; the project and
// its request show in Miya Studio and on the board.
import { ensureFirstBrand } from './contentBrandService';
import { createProject, emptyBrief } from './contentProjectService';
import { requireOutputRoot } from './contentProjectFiles';
import { runContentProject } from './contentStepRunner';

export const NEEDS_OUTPUT_FOLDER = 'Choose an output folder in Settings first, then ask again.';

const MAX_NAME = 60;

/** The message as a project name: at most 60 characters, cut at a word. */
function projectName(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_NAME) return clean;
  const cut = clean.slice(0, MAX_NAME + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 20 ? cut.slice(0, space) : clean.slice(0, MAX_NAME)).trim();
}

export async function startContentProjectFromChat(
  text: string,
  settings: { outputFolder?: string | null },
): Promise<{ ok: boolean; projectId?: string; note: string }> {
  try {
    requireOutputRoot(settings);
  } catch {
    return { ok: false, note: NEEDS_OUTPUT_FOLDER };
  }
  const idea = text.replace(/\s+/g, ' ').trim();
  const brand = ensureFirstBrand();
  const name = projectName(idea);
  const project = createProject(brand.id, name, { ...emptyBrief(), idea });
  // Runs on in the background: Chat answers now; a refusal shows in Miya Studio.
  void runContentProject(project.id, { settings }).catch(() => undefined);
  return {
    ok: true,
    projectId: project.id,
    note: `Started the Miya Studio project "${name}" for ${brand.name}. Jose runs it step by step and stops after the review for your approval.`,
  };
}
