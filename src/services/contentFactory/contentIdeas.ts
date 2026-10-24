// Follow-up ideas from a brand's good posts (content factory phase 4a). After a post's
// 7-day reading comes out "good" for its brand, Nova is asked through Jose (one step) for up
// to 3 follow-ups; they wait in the brand's Ideas list (and on Telegram) until you start a
// project from one or dismiss it.
import { submitStepsToJose } from '../jose/submitToJose';
import { getBrand } from './contentBrandService';
import { createProject, emptyBrief, getProject } from './contentProjectService';
import { postBand } from './brandResults';
import { PROJECT_LABEL } from './contentStepRunner';
import { secureId, type ContentIdea, type ContentProject } from './contentTypes';

const IDEAS_KEY = 'alphonso_content_ideas_v1';
const IDEAS_KEPT = 200;
export const IDEAS_TASK_MARK = 'This post did well for the brand:';

function readIdeas(): ContentIdea[] {
  try {
    const raw = localStorage.getItem(IDEAS_KEY);
    return raw ? (JSON.parse(raw) as ContentIdea[]) : [];
  } catch {
    return [];
  }
}
function writeIdeas(ideas: ContentIdea[]): void {
  try { localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas.slice(-IDEAS_KEPT))); } catch { /* storage full or blocked */ }
}

/** Asks Nova for follow-ups when the post did well for its brand. */
export async function proposeIdeas(projectId: string, postId: string): Promise<{ ok: boolean; reason?: string }> {
  const project = getProject(projectId);
  const post = project?.posts?.find((p) => p.id === postId);
  const brand = project ? getBrand(project.brandId) : null;
  if (!project || !post || !brand) return { ok: false, reason: 'That post was not found.' };
  if (postBand(post, brand.id, '7d') !== 'good') return { ok: false, reason: 'Ideas come from posts that did well for the brand.' };
  const views = post.metrics?.readings?.['7d']?.values?.views;
  const task = `${IDEAS_TASK_MARK} "${post.title}" (${post.platform}, ${Math.round(Number(views || 0)).toLocaleString('en-US')} views in 7 days, well above the brand's usual). Suggest up to 3 follow-up videos: a sequel, the same hook on another topic, or a Short from it. One line each, ready to be a new project's idea.`;
  const postRef = { projectId, postId };
  try {
    const result: any = await submitStepsToJose({
      text: `Ideas from "${post.title}"`,
      source: 'content-factory', label: PROJECT_LABEL, saveDecisions: false,
      steps: [{
        stepId: 'nova', agent: 'nova', actionType: 'analysis_ideas', effects: ['read'], needs: [], instruction: task,
        contentStep: { projectId, step: 'publish', brief: project.brief, brand, prior: {}, task, purpose: 'ideas', postRef },
      }],
    });
    return { ok: result?.ok !== false };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

/** Saves Nova's ideas for the brand (the recorder calls this). */
export function saveIdeas(brandId: string, texts: string[], fromPost: { projectId: string; postId: string }): ContentIdea[] {
  const added = texts.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 3)
    .map((text) => ({ id: secureId('idea'), brandId, text, fromPost, atMs: Date.now(), status: 'new' as const }));
  if (added.length) writeIdeas([...readIdeas(), ...added]);
  return added;
}

export function listIdeas(brandId: string): ContentIdea[] {
  return readIdeas().filter((i) => i.brandId === brandId && i.status === 'new');
}

export function getIdea(ideaId: string): ContentIdea | null {
  return readIdeas().find((i) => i.id === ideaId) || null;
}

function setStatus(ideaId: string, status: ContentIdea['status']): ContentIdea | null {
  let found: ContentIdea | null = null;
  writeIdeas(readIdeas().map((i) => {
    if (i.id !== ideaId) return i;
    found = { ...i, status };
    return found;
  }));
  return found;
}

/** A new project for the idea's brand, with the idea as its brief; null when already decided. */
export function startProjectFromIdea(ideaId: string): ContentProject | null {
  const idea = getIdea(ideaId);
  if (!idea || idea.status !== 'new' || !getBrand(idea.brandId)) return null;
  const project = createProject(idea.brandId, idea.text.slice(0, 60), { ...emptyBrief(), idea: idea.text });
  setStatus(ideaId, 'started');
  return project;
}

/** Hides an idea; false when it was already decided. */
export function dismissIdea(ideaId: string): boolean {
  const idea = getIdea(ideaId);
  if (!idea || idea.status !== 'new') return false;
  setStatus(ideaId, 'dismissed');
  return true;
}
