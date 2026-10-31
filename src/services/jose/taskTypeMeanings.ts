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
  assistant_explain_code: 'explain how code in one of your projects works, in plain words; changes nothing',
  assistant_summarize: 'summarise a file in one of your projects: main points, decisions, open questions',
  verification_workflow_step: 'check that code works: build, tests, lint',
  // Miya
  creative_package: 'a quick creative idea: title, hook, short script, scenes, picture prompts',
  creative_image: 'make a picture',
  creative_higgsfield: 'make a picture or clip with Higgsfield, asked by name',
  creative_chat_video: 'make a short video clip on this computer, asked for in words',
  creative_chat_music: 'make a piece of music on this computer, asked for in words',
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
  research_compare: 'compare products or services side by side: prices and features, each with its source and date',
  research_people: "find companies or people's public work details (name, role, company, public work page); never private contact details",
  research_workflow_step: 'a research step in a workflow',
  // Nova
  analysis_findings: 'judge what research found: what matters, in what order',
  opportunity_analysis: 'judge whether something is worth doing',
  analysis_market: 'judge a market from what Hector found',
  analysis_content_review: "judge a video's hook and script",
  analysis_performance: "read how a post did against the brand's usual numbers",
  analysis_ideas: 'suggest follow-up videos from a post that did well',
  analysis_pros_cons: 'the gains, costs and risks of one decision, and what would change the answer',
  analysis_pricing: "what to charge, from what rivals charge and the value, using Hector's findings",
  analysis_workflow_step: 'an analysis step in a workflow',
  strategy_timing: 'when to post on each platform',
  // Maria
  audit_quality: 'review work for quality and accuracy; pass or fix',
  audit_claims: 'check facts and numbers in work against its sources',
  audit_content_quality: "score a video's pieces against the brand's reference posts",
  audit_workflow_step: 'a review step in a workflow',
  audit_code: "review Alphonso's changed code; findings with file and line",
  audit_brand_voice: "check writing against a brand's tone, audience, rules and kept lessons",
  governance_audit: 'check an action for policy, approval and risk',
  risk_review: 'judge the risk of an action',
  // Sentinel
  security_monitor: 'check for security problems (secrets, unsafe links or commands)',
  security_review: 'a security review of work or an action',
  security_content_check: "check a video's text and links before posting",
  security_workflow_step: 'a security step in a workflow',
  permission_audit: 'check what an agent, tool or connector is allowed to do',
  security_dependencies: "check a project's dependency files for unknown, unmaintained or risky packages",
  security_personal_data: 'check text for private contact details, home addresses, phone numbers or ID numbers before it is sent or saved',
  // Marcus
  distribution_execution: 'send what an earlier step wrote; Marcus picks where',
  distribution_release: 'make a draft GitHub release with notes an earlier step wrote',
  distribution_issue: 'open a GitHub issue an earlier step wrote',
  distribution_outside_tool: 'use a tool of an outside service (MCP) that changes or sends something; asks first with the exact call',
  distribution_review: 'check what would be sent and where; sends nothing',
  distribution_readiness: 'check that something is ready to send; sends nothing',
  distribution_schedule_posts: 'publish or schedule approved posts',
  outreach_call: 'place an approved phone call',
  distribution_newsletter: 'send an email newsletter through an n8n workflow or a mail app in Composio',
  // Echo
  memory_preservation: 'save what was decided, or what you asked to remember',
  memory_workflow_step: 'a memory step in a workflow',
  memory_recall: 'answer what was decided before, from the saved decisions',
  memory_forget: 'forget a saved decision you name',
  memory_cleanup: 'propose merges and replacements in memory; nothing changes until you apply them',
  knowledge_curation: 'propose merges and replacements in memory; nothing changes until you apply them',
  memory_digest: "this week's decisions by topic, with where each was made",
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

// The simple plan's fallback rule for code (agent phase 6, owner 2026-10-26): used only when
// Jose's model can't plan. Words like test, check, run, add, install, file or verify alone are
// not code: "quiz questions to test my students" is writing.
/** Words that mean code on their own. */
const CODE_WORDS = ['code', 'coding', 'bug', 'bugs', 'compile', 'refactor', 'repo', 'repository', 'npm', 'cargo', 'pip', 'function', 'functions', 'api', 'component', 'frontend', 'backend', 'endpoint', 'deploy', 'debug'];
/** Programming languages and frameworks: a script or an app in one is code. */
const CODE_LANGUAGES = ['typescript', 'javascript', 'python', 'rust', 'java', 'golang', 'ruby', 'php', 'kotlin', 'swift', 'c#', 'c++', 'html', 'css', 'sql', 'bash', 'powershell', 'node', 'nodejs', 'node.js', 'react', 'vue', 'angular', 'svelte', 'next.js', 'django', 'flask', 'tauri', 'electron'];
/** Things that are code when you make them or when they are yours. */
const CODE_THINGS = 'app|apps|website|site|program|programs|extension|plugin|bot|cli';
const CODE_FILE = /\b[\w-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|rb|php|cs|cpp|c|h|html|css|json|sh|ps1|sql|toml|ya?ml|vue|svelte|kt|swift)\b/;
const YOUR_PROJECT = /\b(?:my|our)\s+(?:app|apps|website|site|project|repo|repository|codebase|code|program|extension|plugin|bot)\b|\b(?:the|this)\s+(?:project|repo|repository|codebase)\b/;
const MAKE_A_THING = new RegExp(`\\b(?:build|create|make|develop|implement|code|program|scaffold)\\s+(?:me\\s+)?(?:a|an|the|my|our)?\\s*(?:[\\w-]+\\s+){0,2}(?:${CODE_THINGS})\\b`);
/** A script or program that works on files, folders or data is code; a script for a video is not. */
const SCRIPT_ON_DATA = /\b(?:script|program)s?\b[^.?!]*\b(?:files?|folders?|director(?:y|ies)|csv|json|spreadsheets?|automat\w*|command\s+line|terminal)\b/;
const RUN_CHECKS = /\b(?:run|fix)\s+(?:the\s+|all\s+|my\s+)?(?:failing\s+|unit\s+)?tests\b|\b(?:failing|unit|integration)\s+tests?\b|\btest\s+suite\b|\blinter\b/;

/** Whether the text talks about an existing project of yours ("this project", "my app"). */
export function refersToAProject(text: string): boolean {
  return YOUR_PROJECT.test(String(text || '').toLowerCase());
}

/** Whether the text asks for work on code. */
export function isCodeRequest(text: string): boolean {
  // A discount, promo or referral code is an offer, not code (agent phase 3).
  const value = String(text || '').toLowerCase().replace(/\b(?:discount|promo|promotional|coupon|voucher|referral|gift)\s+codes?\b/g, ' offer ');
  const words = new Set(value.split(/[^a-z0-9'#+.]+/).map((w) => w.replace(/\.+$/, '')).filter(Boolean));
  if (CODE_WORDS.some((word) => words.has(word))) return true;
  if (CODE_LANGUAGES.some((lang) => words.has(lang))) return true;
  return CODE_FILE.test(value) || YOUR_PROJECT.test(value) || MAKE_A_THING.test(value) || RUN_CHECKS.test(value) || SCRIPT_ON_DATA.test(value);
}

/** Words that ask for facts, sources or current information (agent phase 6): writing needs research only then. */
const FACT_WORDS = /\b(?:research|sources?|facts?|latest|current|news|prices?|pricing|statistics|stats|compare|comparison|look\s+up|find\s+out|data\s+on)\b/;

export function needsFacts(text: string): boolean {
  return FACT_WORDS.test(String(text || '').toLowerCase());
}

export function isCodeTask(actionType: string, effects: string[] = []): boolean {
  const type = String(actionType || '').toLowerCase();
  return CODE_TASK_PREFIXES.some((prefix) => type.startsWith(prefix)) || effects.includes('run') || effects.includes('change_project');
}
