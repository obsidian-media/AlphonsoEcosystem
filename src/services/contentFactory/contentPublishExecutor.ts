// Miya content factory phase 3a: the Publish step (Marcus,
// distribution_schedule_posts). Runs only after you approved it (its
// publish_or_send effect always asks), and only for the posts you approved in
// Campaign Studio. YouTube and Facebook schedule on the platform now; Instagram
// is handed to Marcus's runner (Meta cannot schedule it), or posted now when
// its time has passed.
import { scheduleContentPost, scheduleContentReminder } from '../marcusExecutionService';
import type { ContentStepResult } from './contentAgentExecutor';
import { getProject } from './contentProjectService';
import { updatePost } from './contentPosts';
import { contentAppSettings } from './contentStepRecorder';
import type { StepId } from './contentTypes';
import { publishPost, type PostResult } from './publishPost';

export const NO_APPROVED_POSTS = 'No posts are approved. Check the Posts list in Campaign Studio and choose "Approve and schedule".';

interface PublishAssignment { agent: string; actionType: string; contentStep: { projectId: string; step: StepId } }

const LABEL: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };

function result(assignment: PublishAssignment, state: 'completed' | 'failed', summary: string, data: unknown, reason?: string): ContentStepResult {
  return {
    summary,
    resultState: state,
    artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data, raw: '' }],
    sources: [],
    contractAction: assignment.actionType,
    ...(reason ? { failureReason: reason } : {}),
  };
}

export async function executePublishStep(assignment: PublishAssignment, nowMs = Date.now()): Promise<ContentStepResult> {
  const { projectId } = assignment.contentStep;
  const project = getProject(projectId);
  if (!project) return result(assignment, 'failed', 'marcus: project not found', null, `Content project not found: ${projectId}`);
  const approved = (project.posts || []).filter((p) => p.status === 'approved');
  if (!approved.length) return result(assignment, 'failed', `marcus: ${NO_APPROVED_POSTS}`, null, NO_APPROVED_POSTS);

  const settings = contentAppSettings();
  const outcomes: { id: string; platform: string; piece: string; status: string; link?: string; reason?: string }[] = [];
  for (const post of approved) {
    let outcome: PostResult;
    if (post.platform === 'instagram' && post.scheduledAtMs > nowMs + 60_000) {
      scheduleContentPost({ projectId, postId: post.id, platform: 'instagram', scheduledAt: post.scheduledAtMs });
      outcome = { status: 'scheduled', reason: 'Alphonso posts this at its time (Meta cannot schedule Instagram); it goes out at the next start if the app is closed then.' };
    } else {
      outcome = await publishPost(post, settings, nowMs);
      if (outcome.status === 'locked_private' && post.scheduledAtMs > nowMs && outcome.platformId) {
        scheduleContentReminder({
          projectId, postId: post.id, scheduledAt: post.scheduledAtMs,
          message: `Make "${post.title}" public now in YouTube Studio: https://studio.youtube.com/video/${outcome.platformId}/edit`,
        });
      }
    }
    updatePost(projectId, post.id, { status: outcome.status, link: outcome.link, platformId: outcome.platformId, reason: outcome.reason });
    outcomes.push({ id: post.id, platform: post.platform, piece: post.piece, status: outcome.status, link: outcome.link, reason: outcome.reason });
  }

  const count = (status: string) => outcomes.filter((o) => o.status === status).length;
  const parts = [
    count('scheduled') && `${count('scheduled')} scheduled`,
    count('posted') && `${count('posted')} posted`,
    count('locked_private') && `${count('locked_private')} kept private by YouTube (a reminder comes at the time)`,
    count('check') && `${count('check')} to check`,
    count('failed') && `${count('failed')} failed`,
  ].filter(Boolean);
  const summary = `Posts: ${parts.join(', ')}.`;
  const failures = outcomes.filter((o) => o.status === 'failed');
  if (failures.length === outcomes.length) {
    const reason = failures.map((f) => `${LABEL[f.platform] || f.platform} ${f.piece}: ${f.reason || 'failed'}`).join(' ');
    return result(assignment, 'failed', `marcus: ${reason}`, { posts: outcomes }, reason);
  }
  return result(assignment, 'completed', summary, { posts: outcomes });
}
