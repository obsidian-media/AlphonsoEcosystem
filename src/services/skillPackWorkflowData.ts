import { TRUST_STATES } from './trustModel';

export const AGENT_WORKFLOW_SKILL_DEFS = [
  {
    id: 'pack.workflow.find-skills',
    name: 'find-skills',
    description: 'Discover and install skills from skills.sh directly inside an agent session.',
    permissions: ['skills.discover', 'skills.install', 'session.read']
  },
  {
    id: 'pack.workflow.agent-browser',
    name: 'agent-browser',
    description: 'Automate browser navigation, clicks, form fills, extraction, and screenshots.',
    permissions: ['browser.navigate', 'browser.click', 'browser.fill', 'browser.extract', 'browser.screenshot']
  },
  {
    id: 'pack.workflow.skill-creator',
    name: 'skill-creator',
    description: 'Create, test, and publish new skills from within the agent environment.',
    permissions: ['skills.create', 'skills.test', 'skills.publish']
  },
  {
    id: 'pack.workflow.brainstorming',
    name: 'brainstorming',
    description: 'Use structured ideation and problem decomposition during task intake.',
    permissions: ['ideation.organize', 'problem.decompose']
  },
  {
    id: 'pack.workflow.browser-use',
    name: 'browser-use',
    description: 'Use visual browser automation when page structure is inconsistent or unknown.',
    permissions: ['browser.vision', 'browser.interpret', 'browser.navigate']
  },
  {
    id: 'pack.workflow.systematic-debugging',
    name: 'systematic-debugging',
    description: 'Debug by hypothesis, test, and verification rather than random edits.',
    permissions: ['debug.observe', 'debug.hypothesize', 'debug.test', 'debug.verify']
  },
  {
    id: 'pack.workflow.writing-plans',
    name: 'writing-plans',
    description: 'Write structured implementation plans before starting complex tasks.',
    permissions: ['planning.decompose', 'planning.sequence', 'planning.checkpoints']
  },
  {
    id: 'pack.workflow.executing-plans',
    name: 'executing-plans',
    description: 'Execute plans step-by-step with checkpoints and verification.',
    permissions: ['execution.steps', 'execution.checkpoints', 'verification.before_completion']
  },
  {
    id: 'pack.workflow.test-driven-development',
    name: 'test-driven-development',
    description: 'Run a TDD loop: fail, implement minimally, verify, and refactor.',
    permissions: ['tests.write_first', 'tests.verify', 'refactor.minimal']
  },
  {
    id: 'pack.workflow.requesting-code-review',
    name: 'requesting-code-review',
    description: 'Prepare code for review with self-review, test coverage, and PR context.',
    permissions: ['review.self', 'review.prepare', 'review.request']
  },
  {
    id: 'pack.workflow.subagent-driven-development',
    name: 'subagent-driven-development',
    description: 'Orchestrate specialized subagents across different parts of a task.',
    permissions: ['subagents.orchestrate', 'task.specialize', 'task.coordinate']
  },
  {
    id: 'pack.workflow.verification-before-completion',
    name: 'verification-before-completion',
    description: 'Force a verification pass before a task can be marked complete.',
    permissions: ['verification.require', 'completion.gate', 'release.truth']
  },
  {
    id: 'pack.workflow.dispatching-parallel-agents',
    name: 'dispatching-parallel-agents',
    description: 'Split work across parallel subagents and coordinate their outputs.',
    permissions: ['parallel.dispatch', 'parallel.coordinate', 'parallel.verify']
  },
  {
    id: 'pack.workflow.using-git-worktrees',
    name: 'using-git-worktrees',
    description: 'Use git worktrees to run parallel sessions on isolated branches.',
    permissions: ['git.worktree', 'branch.isolation', 'parallel.workspace']
  },
  {
    id: 'pack.workflow.finishing-a-development-branch',
    name: 'finishing-a-development-branch',
    description: 'Close branches cleanly with tests, commits, pull requests, and review requests.',
    permissions: ['tests.run', 'commit.write', 'pr.open', 'review.request']
  },
  {
    id: 'pack.workflow.ralph-tui-prd',
    name: 'ralph-tui-prd',
    description: 'Generate a structured prd.json task list for autonomous loop execution.',
    permissions: ['tasklist.prd', 'autonomy.loop', 'task.decompose']
  },
  {
    id: 'pack.workflow.ralph-tui-create-beads',
    name: 'ralph-tui-create-beads',
    description: 'Create dependency-aware Beads tasks for autonomous loop execution.',
    permissions: ['tasklist.dependencies', 'autonomy.loop', 'task.track']
  },
  {
    id: 'pack.workflow.ralph-tui-create-json',
    name: 'ralph-tui-create-json',
    description: 'Create JSON-format task lists for autonomous task execution.',
    permissions: ['tasklist.json', 'autonomy.loop', 'task.export']
  },
  {
    id: 'pack.workflow.ralph-wiggum',
    name: 'ralph-wiggum',
    description: 'Use the simplified autonomous loop technique with minimal setup.',
    permissions: ['autonomy.loop', 'setup.minimal', 'task.retry']
  },
  {
    id: 'pack.workflow.ralph-loop',
    name: 'ralph-loop',
    description: 'Run a sustained autonomous task completion loop with agent mode.',
    permissions: ['autonomy.loop', 'task.persistence', 'task.retry']
  }
];

export const AGENT_WORKFLOW_PACKS = AGENT_WORKFLOW_SKILL_DEFS.map((skill) => ({
  id: skill.id,
  name: skill.name,
  version: '1.0.0',
  enabled: true,
  permissions: skill.permissions,
  category: 'agent_workflow',
  topic: 'agent-workflows',
  source: 'skills.sh/topic/agent-workflows',
  description: skill.description,
  trust: TRUST_STATES.VERIFIED
}));
