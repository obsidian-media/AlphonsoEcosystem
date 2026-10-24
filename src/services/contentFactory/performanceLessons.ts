// Lessons from a post's real numbers (content factory phase 4a). After its 7-day reading,
// Nova and Miya are asked through Jose — one step each — what worked and what didn't,
// against the brand's usual numbers. Their answers are saved as proposed lessons, which
// reach prompts only once you keep them (Brands tab → Results, or Telegram).
import { submitStepsToJose } from '../jose/submitToJose';
import { getBrand } from './contentBrandService';
import { getProject } from './contentProjectService';
import { brandMedian, MAIN_METRIC } from './brandResults';
import { PROJECT_LABEL } from './contentStepRunner';
import type { PostPlatform } from './contentTypes';
import type { PlanStep } from '../jose/stepGraph';

export const LESSONS_TASK_MARK = 'How this post did after 7 days:';
const PLATFORM_NAME: Record<PostPlatform, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
const PIECE_NAME: Record<string, string> = { video: 'a video', short: 'a Short', reel: 'a Reel', carousel: 'a carousel' };

const n = (v: number) => Math.round(v).toLocaleString('en-US');

/** Asks Nova and Miya for lessons from one post's 7-day numbers. */
export async function proposeLessons(projectId: string, postId: string): Promise<{ ok: boolean; reason?: string }> {
  const project = getProject(projectId);
  const post = project?.posts?.find((p) => p.id === postId);
  const reading = post?.metrics?.readings?.['7d'];
  const brand = project ? getBrand(project.brandId) : null;
  if (!project || !post || !reading || !brand || typeof reading.values[MAIN_METRIC] !== 'number') {
    return { ok: false, reason: 'This post has no 7-day numbers.' };
  }
  const platform = PLATFORM_NAME[post.platform];
  const usual = brandMedian(brand.id, post.platform, '7d', post.id);
  const numbers = Object.entries(reading.values).map(([k, v]) => `${n(v)} ${k}`).join(', ');
  const when = new Date(post.sentAtMs || post.scheduledAtMs).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const task = [
    `${LESSONS_TASK_MARK} "${post.title}", ${PIECE_NAME[post.piece] || post.piece} on ${platform}, posted ${when}: ${numbers}.`,
    usual === null ? 'There are too few earlier posts to say what is usual for this brand.' : `The usual for this brand on ${platform}: ${n(usual)} views.`,
  ].join(' ');
  const postRef = { projectId, postId };
  const step = (agent: 'nova' | 'miya', actionType: string, effect: 'read' | 'write_own_work'): PlanStep => ({
    stepId: agent, agent, actionType, effects: [effect], needs: [], instruction: task,
    contentStep: { projectId, step: 'publish', brief: project.brief, brand, prior: {}, task, purpose: 'lessons', postRef },
  });
  try {
    const result: any = await submitStepsToJose({
      text: `Lessons from "${post.title}"`,
      source: 'content-factory', label: PROJECT_LABEL, saveDecisions: false,
      steps: [step('nova', 'analysis_performance', 'read'), step('miya', 'creative_lessons', 'write_own_work')],
    });
    return { ok: result?.ok !== false };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}
