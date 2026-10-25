// Templates are starting points for Jose's plans, never required (owner,
// 2026-10-23). Jose scores how well each fits a request; below the threshold
// he plans fresh, and a partly fitting one he adapts (josePlanner.ts).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.4
import type { PlanStep } from './stepGraph';
import { listUserTemplates } from './joseUserTemplates';

export interface JoseTemplate {
  id: string;
  name: string;
  kind: 'normal' | 'project';
  /** Every group must match (any of its words, as a whole word) for a full fit. */
  matchWords: string[][];
  steps: PlanStep[];
}

/** A template fits when every one of its word groups matches. */
export const TEMPLATE_FIT_THRESHOLD = 0.75;

const step = (stepId: string, agent: string, actionType: string, instruction: string, needs: string[] = [], effects: PlanStep['effects'] = ['read'], reviewOf?: string): PlanStep =>
  ({ stepId, agent, actionType, instruction, needs, effects, ...(reviewOf ? { reviewOf } : {}) });

export const JOSE_TEMPLATES: JoseTemplate[] = [
  {
    id: 'content_video',
    name: 'Content video',
    kind: 'normal',
    matchWords: [
      ['video', 'youtube', 'tiktok', 'reel', 'reels', 'shorts', 'vlog'],
      ['script', 'content', 'campaign', 'channel', 'thumbnail', 'thumbnails', 'post', 'upload', 'launch', 'promo'],
    ],
    steps: [
      // The Miya content factory's own steps (phase 6b); a project runs them as one request.
      step('research_trends', 'hector', 'research_virality', 'Find what makes videos on this topic do well: real examples, hooks and formats, with sources.'),
      // Hector finds, Nova judges (owner, 2026-10-24).
      step('research_market', 'nova', 'analysis_market', "Judge the audience and the opportunity from Hector's research: who it is for and why now.", ['research_trends']),
      step('script', 'miya', 'creative_script', 'Write three hooks and a timed script for the video, using the research.', ['research_trends', 'research_market'], ['write_own_work']),
      step('review_value', 'nova', 'analysis_content_review', 'Review the hook and the script for value to the audience and say what must change.', ['script'], ['read'], 'script'),
      step('review_quality', 'maria', 'audit_content_quality', 'Score the script against the references and check its claims are honest.', ['script'], ['read'], 'script'),
      step('scenes', 'miya', 'creative_scenes', 'Plan the storyboard and shot list for the script, with a picture for each scene.', ['review_value', 'review_quality'], ['write_own_work']),
      step('thumbnail', 'miya', 'creative_thumbnails', 'Design three thumbnails with a short headline in the brand colours.', ['scenes'], ['write_own_work']),
      // The finished video file (Miya content factory phase 2a).
      step('voice', 'miya', 'creative_voice', 'Read the script aloud in the brand voice, one line per scene.', ['thumbnail'], ['write_own_work']),
      step('music', 'miya', 'creative_music', 'Make a music bed for the video from the brief.', ['thumbnail'], ['write_own_work']),
      step('sfx', 'miya', 'creative_sfx', 'Choose a short sound effect for the scenes where one helps, and make them.', ['voice', 'music'], ['write_own_work']),
      step('broll', 'hector', 'research_broll', 'Find a stock clip for each scene from the sources that have keys.', ['thumbnail']),
      step('clips', 'miya', 'creative_video_clips', 'Make an AI video clip for each main moment, from its scene picture.', ['scenes', 'broll'], ['write_own_work']),
      step('assemble', 'miya', 'creative_assemble_video', 'Cut the finished video in 16:9 and 9:16 with the voice, music, AI clips and captions.', ['voice', 'music', 'sfx', 'broll', 'clips'], ['write_own_work']),
      // Shorts (phase 3d), only when the brief asks for Shorts or Reels: each its own piece.
      step('shorts', 'miya', 'creative_shorts', 'Plan and make the Shorts: each a mini-script, a highlight with a new hook, or a cut of the finished video.', ['assemble'], ['write_own_work']),
      // A carousel (phase 3c), only when the brief asks for one: 5 to 10 slides, a picture each.
      step('carousel', 'miya', 'creative_carousel', 'Write 5 to 10 carousel slides from the research and script, with a picture for each.', ['thumbnail'], ['write_own_work']),
      step('campaign', 'miya', 'creative_campaign', 'Write the captions, hashtags, ad copy and a posting calendar.', ['assemble', 'carousel'], ['write_own_work']),
      step('timing', 'nova', 'strategy_timing', 'Choose the best times to put the video out on each platform.', ['assemble']),
      step('quality', 'maria', 'audit_content_quality', 'Score every piece against the references before anything goes out.', ['campaign', 'timing']),
      step('security', 'sentinel', 'security_content_check', 'Check the text and links for anything unsafe or misleading.', ['campaign', 'timing']),
      // Publishing (Miya content factory phase 3a): only the posts you approved in Campaign Studio.
      step('publish', 'marcus', 'distribution_schedule_posts', 'Post or schedule the approved posts on YouTube, Instagram and Facebook at their times.', ['quality', 'security'], ['publish_or_send']),
    ],
  },
  {
    id: 'build_app',
    name: 'Build an app',
    kind: 'project',
    matchWords: [
      ['app', 'apps', 'application', 'website', 'site', 'web', 'frontend', 'backend', 'api', 'software', 'dashboard'],
      ['build', 'create', 'make', 'develop', 'code', 'implement', 'design', 'scaffold'],
    ],
    steps: [
      step('research', 'hector', 'research_report', 'Find how similar apps solve this, and the libraries and docs that apply, with sources.'),
      step('design', 'miya', 'design_ui', 'Design the screens and the user flow. No code: Alphonso builds it.', ['research'], ['write_own_work']),
      step('build', 'alphonso', 'local_operation', 'Build the app in the project folder from the design, and check that it runs.', ['design'], ['run']),
      step('security', 'sentinel', 'security_review', 'Review the app for security problems: secrets, unsafe inputs, risky dependencies.', ['build'], ['read'], 'build'),
      step('quality', 'maria', 'audit_quality', 'Check the app against the request: what works, what is missing.', ['build'], ['read'], 'build'),
    ],
  },
  {
    id: 'research_report',
    name: 'Research report',
    kind: 'normal',
    matchWords: [
      ['research', 'investigate', 'analyse', 'analyze', 'study', 'compare', 'market', 'competitors', 'sources'],
      ['report', 'summary', 'brief', 'findings', 'overview'],
    ],
    steps: [
      step('research', 'hector', 'research_report', 'Find the facts and sources for the question, with citations.'),
      step('analysis', 'nova', 'analysis_findings', 'Judge what the findings mean: what matters most and why.', ['research']),
      step('review', 'maria', 'audit_quality', 'Check the findings against the sources: anything unsupported or missing.', ['analysis'], ['read'], 'analysis'),
    ],
  },
];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

/** How well each template fits `text` (matched groups ÷ groups), best first. */
/** The built-in templates and the ones the user saved (phase 3). */
export function allTemplates(): JoseTemplate[] {
  return [...JOSE_TEMPLATES, ...listUserTemplates()];
}

export function scoreTemplateFit(text: string): { templateId: string; score: number }[] {
  const value = String(text || '');
  return allTemplates()
    .map((template) => {
      const matched = template.matchWords.filter((group) => group.some((word) => hasWord(value, word))).length;
      return { templateId: template.id, score: template.matchWords.length ? matched / template.matchWords.length : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

export function getTemplate(id: string): JoseTemplate | null {
  return allTemplates().find((template) => template.id === id) || null;
}
