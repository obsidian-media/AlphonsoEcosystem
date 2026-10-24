// Which agents do each content-factory step, and what earlier steps a step
// reads. Its own module so the executor and the recorder (both reached from
// Jose's engine) don't import the runner, which imports the engine.
import { chosenVersionOf } from './contentProjectService';
import { STEP_ORDER, type ContentProject, type StepId } from './contentTypes';

export interface StepAgent { agent: string; actionType: string; title: string }

export const STEP_AGENTS: Record<StepId, StepAgent[]> = {
  brief: [],
  research: [
    { agent: 'hector', actionType: 'research_virality', title: 'Virality research' },
    { agent: 'nova', actionType: 'analysis_market', title: 'Market and competitor check' },
  ],
  script: [{ agent: 'miya', actionType: 'creative_script', title: 'Hooks and timed script' }],
  review: [
    { agent: 'nova', actionType: 'analysis_content_review', title: 'Hook and script review' },
    { agent: 'maria', actionType: 'audit_content_quality', title: 'Quality review against the references' },
  ],
  scenes: [{ agent: 'miya', actionType: 'creative_scenes', title: 'Storyboard and shot list' }],
  thumbnail: [{ agent: 'miya', actionType: 'creative_thumbnails', title: 'Three thumbnail concepts' }],
  voice: [{ agent: 'miya', actionType: 'creative_voice', title: 'Voice-over in the brand voice' }],
  music: [{ agent: 'miya', actionType: 'creative_music', title: 'Music bed' }],
  broll: [{ agent: 'hector', actionType: 'research_broll', title: 'Stock clips for the scenes' }],
  clips: [{ agent: 'miya', actionType: 'creative_video_clips', title: 'AI clips for the main moments' }],
  assemble: [{ agent: 'alphonso', actionType: 'runtime_assemble_video', title: 'The finished video, 16:9 and 9:16' }],
  shorts: [{ agent: 'miya', actionType: 'creative_shorts', title: 'Shorts' }],
  carousel: [{ agent: 'miya', actionType: 'creative_carousel', title: 'Carousel slides' }],
  campaign: [
    { agent: 'miya', actionType: 'creative_campaign', title: 'Captions, ads and calendar' },
    { agent: 'nova', actionType: 'strategy_timing', title: 'Posting times' },
  ],
  quality: [
    { agent: 'maria', actionType: 'audit_content_quality', title: 'Quality gate' },
    { agent: 'sentinel', actionType: 'security_content_check', title: 'Text and link check' },
  ],
  // Phase 3a: Marcus schedules the posts you approved (always asks first).
  publish: [{ agent: 'marcus', actionType: 'distribution_schedule_posts', title: 'Schedule the posts' }],
};

/** The chosen output of each step before this one. */
export function priorOutputs(project: ContentProject, step: StepId): Partial<Record<StepId, unknown>> {
  const prior: Partial<Record<StepId, unknown>> = {};
  for (const earlier of STEP_ORDER.slice(0, STEP_ORDER.indexOf(step))) {
    const chosen = chosenVersionOf(project, earlier);
    if (chosen) prior[earlier] = chosen.output;
  }
  return prior;
}

export function stepMarkdown(project: ContentProject, step: StepId, version: number, output: Record<string, unknown>): string {
  const parts = [`# ${project.name}: ${step}, version ${version}`, `Idea: ${project.brief.idea}`];
  for (const [agent, data] of Object.entries(output)) {
    parts.push(`## ${agent}`, '```json', JSON.stringify(data, null, 2), '```');
  }
  return `${parts.join('\n\n')}\n`;
}
