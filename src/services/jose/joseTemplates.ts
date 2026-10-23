// Templates are starting points for Jose's plans, never required (owner,
// 2026-10-23). Jose scores how well each fits a request; below the threshold
// he plans fresh, and a partly fitting one he adapts (josePlanner.ts).
// Design: docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md §2.4
import type { PlanStep } from './stepGraph';

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

const step = (stepId: string, agent: string, actionType: string, instruction: string, needs: string[] = [], effects: PlanStep['effects'] = ['read']): PlanStep =>
  ({ stepId, agent, actionType, instruction, needs, effects });

export const JOSE_TEMPLATES: JoseTemplate[] = [
  {
    id: 'content_video',
    name: 'Content video',
    kind: 'normal',
    matchWords: [
      ['video', 'youtube', 'tiktok', 'reel', 'reels', 'short', 'shorts', 'vlog'],
      ['script', 'content', 'campaign', 'channel', 'thumbnail', 'thumbnails', 'post', 'upload', 'launch', 'promo'],
    ],
    steps: [
      step('research_trends', 'hector', 'research_virality', 'Find what makes videos on this topic do well: real examples, hooks and formats, with sources.'),
      step('research_market', 'nova', 'analysis_market', 'Judge the audience and the opportunity for this video: who it is for and why now.'),
      step('script', 'miya', 'creative_script', 'Write three hooks and a timed script for the video, using the research.', ['research_trends', 'research_market'], ['write_own_work']),
      step('review_value', 'nova', 'analysis_content_review', 'Review the script for value to the audience and say what to improve.', ['script']),
      step('review_quality', 'maria', 'audit_content_quality', 'Check the script for accuracy, honest claims and quality against the research.', ['script']),
      step('campaign', 'miya', 'creative_campaign', 'Write the captions, hashtags and ad copy for the video, using the reviews.', ['review_value', 'review_quality'], ['write_own_work']),
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
      step('design', 'miya', 'creative_ui_design', 'Design the screens and the user flow, and draft the front-end.', ['research'], ['write_own_work']),
      step('build', 'alphonso', 'local_operation', 'Build the app in the project folder from the design, and check that it runs.', ['design'], ['run']),
      step('security', 'sentinel', 'security_review', 'Review the app for security problems: secrets, unsafe inputs, risky dependencies.', ['build']),
      step('quality', 'maria', 'audit_quality', 'Check the app against the request: what works, what is missing.', ['build']),
      step('summary', 'jose', 'orchestration_summary', 'Write one summary: what was built, where it is, and what still needs doing.', ['security', 'quality'], ['write_own_work']),
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
      step('review', 'maria', 'audit_quality', 'Check the findings against the sources: anything unsupported or missing.', ['analysis']),
      step('summary', 'jose', 'orchestration_summary', 'Write the report: the answer, the key findings and the sources.', ['review'], ['write_own_work']),
    ],
  },
];

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

/** How well each template fits `text` (matched groups ÷ groups), best first. */
export function scoreTemplateFit(text: string): { templateId: string; score: number }[] {
  const value = String(text || '');
  return JOSE_TEMPLATES
    .map((template) => {
      const matched = template.matchWords.filter((group) => group.some((word) => hasWord(value, word))).length;
      return { templateId: template.id, score: template.matchWords.length ? matched / template.matchWords.length : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

export function getTemplate(id: string): JoseTemplate | null {
  return JOSE_TEMPLATES.find((template) => template.id === id) || null;
}
