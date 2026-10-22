// Runs one content-factory step through Jose: the step's agents get explicit
// assignments, Jose runs them (packets, approvals, receipts, budget), and the
// result is saved as a new version of the step and written to the project
// folder.
import { runJoseCommandExecutionPipeline } from '../joseExecutionEngineService';
import { getAllAgentOutputs } from '../agentOutputStoreService';
import { getBrand } from './contentBrandService';
import {
  addStepProgress, chosenVersionOf, failStep, getProject, markStepStatus, saveStepVersion, startStep,
} from './contentProjectService';
import { requireOutputRoot, writeProjectFile, writeStepText } from './contentProjectFiles';
import { renderScenePictures, renderThumbnails } from './contentImages';
import { STEP_ORDER, type ContentProject, type ContentStepPayload, type StepId } from './contentTypes';

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
  campaign: [
    { agent: 'miya', actionType: 'creative_campaign', title: 'Captions, ads and calendar' },
    { agent: 'nova', actionType: 'strategy_posting_times', title: 'Posting times' },
  ],
  quality: [
    { agent: 'maria', actionType: 'audit_content_quality', title: 'Quality gate' },
    { agent: 'sentinel', actionType: 'security_content_check', title: 'Text and link check' },
  ],
};

/** What the user sees while an agent works. */
const WORKING: Record<string, string> = {
  research_virality: 'Hector is researching what goes viral…',
  analysis_market: 'Nova is checking the market…',
  creative_script: 'Miya is writing the hooks and the script…',
  analysis_content_review: 'Nova is reviewing the hook and the script…',
  audit_content_quality: 'Maria is scoring it against your references…',
  creative_scenes: 'Miya is planning the scenes…',
  creative_thumbnails: 'Miya is designing three thumbnails…',
  creative_campaign: 'Miya is writing the campaign…',
  strategy_posting_times: 'Nova is choosing posting times…',
  security_content_check: 'Sentinel is checking the text and links…',
};

export const WAITING_FOR_APPROVAL = 'Waiting for your approval in the Approval panel.';

export interface RunStepOptions {
  settings: { outputFolder?: string | null };
  /** Extra instruction, e.g. the reason the user sent the step back with. */
  extraTask?: string;
  onProgress?: (message: string) => void;
}

function priorOutputs(project: ContentProject, step: StepId): Partial<Record<StepId, unknown>> {
  const prior: Partial<Record<StepId, unknown>> = {};
  for (const earlier of STEP_ORDER.slice(0, STEP_ORDER.indexOf(step))) {
    const chosen = chosenVersionOf(project, earlier);
    if (chosen) prior[earlier] = chosen.output;
  }
  return prior;
}

function stepMarkdown(project: ContentProject, step: StepId, version: number, output: Record<string, unknown>): string {
  const parts = [`# ${project.name}: ${step}, version ${version}`, `Idea: ${project.brief.idea}`];
  for (const [agent, data] of Object.entries(output)) {
    parts.push(`## ${agent}`, '```json', JSON.stringify(data, null, 2), '```');
  }
  return `${parts.join('\n\n')}\n`;
}

export async function runContentStep(projectId: string, step: StepId, options: RunStepOptions): Promise<ContentProject> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const brand = getBrand(project.brandId);
  if (!brand) return failStep(projectId, step, 'This project\'s brand no longer exists.');

  let root: string;
  try {
    root = requireOutputRoot(options.settings);
  } catch (error) {
    return failStep(projectId, step, (error as Error).message);
  }

  const agents = STEP_AGENTS[step];
  if (agents.length === 0) return project;
  const started = startStep(projectId, step);
  const say = (message: string) => {
    addStepProgress(projectId, step, message);
    options.onProgress?.(message);
  };

  const prior = priorOutputs(started, step);
  const assignments = agents.map(({ agent, actionType, title }) => {
    const contentStep: ContentStepPayload = {
      projectId, step, brief: started.brief, brand, prior,
      task: [title, options.extraTask].filter(Boolean).join('. '),
    };
    return {
      agent, actionType, title: `${title}: ${started.name}`, rationale: 'Miya content factory step',
      riskLevel: 'low', requiresApproval: false, commandPreview: 'Writes text only; nothing is sent or published.',
      fragments: [], contentStep,
    };
  });

  let result: { commandId?: string; failedCount?: number; pendingApprovalCount?: number; executionReceipts?: { agent?: string; status?: string; reason?: string }[] };
  try {
    result = await runJoseCommandExecutionPipeline({
      commandText: `Content factory: ${step} for "${started.name}"`,
      source: 'content-factory',
      previewMode: false,
      assignments,
      onProgress: (event: { stage?: string; agents?: string[] }) => {
        if (event?.stage === 'wave_start') {
          for (const agent of event.agents || []) {
            const job = agents.find((a) => a.agent === agent);
            if (job) say(WORKING[job.actionType] || `${agent} is working…`);
          }
        }
      },
    });
  } catch (error) {
    return failStep(projectId, step, `Jose could not run this step: ${(error as Error).message}`);
  }

  const failure = (result.executionReceipts || []).find((r) => r.status === 'dead_letter' || r.status === 'failed');
  if ((result.failedCount || 0) > 0) {
    return failStep(projectId, step, failure?.reason || 'An agent could not finish this step.');
  }
  if ((result.pendingApprovalCount || 0) > 0) {
    return markStepStatus(projectId, step, 'needs_approval', WAITING_FOR_APPROVAL);
  }

  const outputs = getAllAgentOutputs(result.commandId || '') as Record<string, { artifacts?: { type?: string; data?: unknown }[] }>;
  const output: Record<string, unknown> = {};
  for (const { agent } of agents) {
    const artifact = (outputs[agent]?.artifacts || []).find((a) => a?.type === 'content_step_output');
    if (!artifact || artifact.data === null || artifact.data === undefined) {
      return failStep(projectId, step, `${agent} gave no result for this step.`);
    }
    output[agent] = artifact.data;
  }

  const saved = saveStepVersion(projectId, step, {
    output,
    summary: agents.map((a) => a.title).join(', '),
    joseCommandId: result.commandId || null,
  });
  const version = saved.steps[step].chosenVersion as number;
  say('Saving to the project folder…');
  try {
    await writeStepText(root, brand, saved, step, version, stepMarkdown(saved, step, version, output));
    await writeProjectFile(root, brand, getProject(projectId) || saved);
  } catch (error) {
    say(`Saved in the app, but the project folder could not be written: ${(error as Error).message}`);
  }
  // The Scene Builder and Thumbnail Studio go on to make their pictures.
  try {
    if (step === 'scenes') await renderScenePictures(projectId, options.settings, say);
    if (step === 'thumbnail') await renderThumbnails(projectId, options.settings, say);
  } catch (error) {
    say(`The pictures could not be made: ${(error as Error).message}`);
  }
  return getProject(projectId) || saved;
}
