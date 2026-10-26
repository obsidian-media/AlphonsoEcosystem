// What each kind of work means, in plain words, for Jose's planner (agent
// phase 1, owner 2026-10-25). Until then the planner saw only prefixes
// ("local_operation, verification_, assistant_…") and a small model gave
// Alphonso a code task for a paragraph. A test fails when a task type in use
// has no meaning here.
import { AGENT_PERMISSION_TABLE, ownerOf } from './agentPermissionTable';

export const TASK_TYPE_MEANINGS: Record<string, string> = {
  // Alphonso
  assistant_answer: 'answer a plain question in words; no code',
  assistant_write: 'everyday writing (an email, a note, a letter, a paragraph, a summary); no code',
  local_operation: 'write or change code in a project, run its commands',
  verification_workflow_step: 'check that code works: build, tests, lint',
  // Miya
  creative_package: 'a quick creative idea: title, hook, short script, scenes, picture prompts',
  creative_image: 'make a picture',
  creative_higgsfield: 'make a picture or clip with Higgsfield, asked by name',
  creative_character_train: "train a brand's character on Higgsfield",
  creative_script: "a content video's hooks and timed script",
  creative_scenes: "a content video's storyboard",
  creative_thumbnails: "a content video's thumbnail ideas",
  creative_shorts: 'plan Shorts from a content video',
  creative_sfx: 'choose sound effects for a video',
  creative_carousel: 'a carousel of slides for social media',
  creative_campaign: 'captions, hashtags, ad copy and posting dates for a video',
  creative_lessons: 'lessons for the next video from how a post did',
  creative_voice: "read a video's voice-over",
  creative_music: "make a video's music",
  creative_video_clips: 'make AI video clips for scenes',
  creative_assemble_video: 'put the finished video together',
  creative_workflow_step: 'a creative step in a workflow',
  creative_ui_design: 'design a screen or page (layout, look); no code',
  design_ui: 'design a screen or page (layout, look); no code',
  // Hector
  research: 'find facts and sources on the web',
  research_report: 'research a question on the web and report the answer with sources',
  research_market: 'find who competes and what they make, with sources',
  research_virality: 'find posts that do well for a content idea',
  research_broll: 'find stock video clips for scenes',
  research_workflow_step: 'a research step in a workflow',
  // Nova
  analysis_findings: 'judge what research found: what matters, in what order',
  opportunity_analysis: 'judge whether something is worth doing',
  analysis_market: 'judge a market from what Hector found',
  analysis_content_review: "judge a video's hook and script",
  analysis_performance: "read how a post did against the brand's usual numbers",
  analysis_ideas: 'suggest follow-up videos from a post that did well',
  analysis_workflow_step: 'an analysis step in a workflow',
  strategy_timing: 'when to post on each platform',
  // Maria
  audit_quality: 'review work for quality and accuracy; pass or fix',
  audit_claims: 'check facts and numbers in work against its sources',
  audit_content_quality: "score a video's pieces against the brand's reference posts",
  audit_workflow_step: 'a review step in a workflow',
  governance_audit: 'check an action for policy, approval and risk',
  risk_review: 'judge the risk of an action',
  // Sentinel
  security_monitor: 'check for security problems (secrets, unsafe links or commands)',
  security_review: 'a security review of work or an action',
  security_content_check: "check a video's text and links before posting",
  security_workflow_step: 'a security step in a workflow',
  permission_audit: 'check what an agent, tool or connector is allowed to do',
  // Marcus
  distribution_execution: 'send what an earlier step wrote; Marcus picks where',
  distribution_release: 'make a draft GitHub release with notes an earlier step wrote',
  distribution_issue: 'open a GitHub issue an earlier step wrote',
  distribution_review: 'check what would be sent and where; sends nothing',
  distribution_readiness: 'check that something is ready to send; sends nothing',
  distribution_schedule_posts: 'publish or schedule approved posts',
  outreach_call: 'place an approved phone call',
  // Echo
  memory_preservation: 'save what was decided to memory',
  memory_workflow_step: 'a memory step in a workflow',
  memory_recall: 'answer from what memory holds',
  knowledge_curation: 'find duplicate or stale notes in memory to merge',
};

/** The task types an agent owns, with their meanings. */
export function taskTypesFor(agent: string): { type: string; meaning: string }[] {
  return Object.entries(TASK_TYPE_MEANINGS)
    .filter(([type]) => ownerOf(type) === agent)
    .map(([type, meaning]) => ({ type, meaning }));
}

/** Each agent but Jose: what it owns and never does, then its task types with meanings. */
export function planningMenu(): string {
  return Object.entries(AGENT_PERMISSION_TABLE)
    .filter(([agent]) => agent !== 'jose')
    .map(([agent, p]) => [`${agent} owns: ${p.owns} Never: ${p.never}`, ...taskTypesFor(agent).map((t) => `- ${t.type}: ${t.meaning}`)].join('\n'))
    .join('\n\n');
}

/** Task types that write or run code (agent phase 1): only for a request about code. */
export const CODE_TASK_PREFIXES = ['local_operation', 'verification_', 'execute_command', 'filesystem_'];

const CODE_WORDS = ['code', 'coding', 'app', 'apps', 'website', 'build', 'compile', 'test', 'tests', 'bug', 'bugs', 'fix', 'function', 'script', 'scripts', 'repo', 'repository', 'install', 'deploy', 'file', 'files', 'api', 'component', 'refactor', 'npm', 'cargo', 'program', 'typescript', 'javascript', 'python', 'rust', 'react'];

/** Whether the text asks for work on code (whole words). */
export function isCodeRequest(text: string): boolean {
  // A discount, promo or referral code is an offer, not code (agent phase 3).
  const value = String(text || '').toLowerCase().replace(/\b(?:discount|promo|promotional|coupon|voucher|referral|gift)\s+codes?\b/g, ' offer ');
  const words = new Set(value.split(/[^a-z0-9']+/).filter(Boolean));
  return CODE_WORDS.some((word) => words.has(word));
}

export function isCodeTask(actionType: string, effects: string[] = []): boolean {
  const type = String(actionType || '').toLowerCase();
  return CODE_TASK_PREFIXES.some((prefix) => type.startsWith(prefix)) || effects.includes('run') || effects.includes('change_project');
}
