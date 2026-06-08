import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse, fetchOllamaModels, PREFERRED_MODEL, normalizeEndpoint } from '../lib/ollama';

const GOALS_KEY = 'alphonso_boardroom_goals_v1';
const BATCHES_KEY = 'alphonso_boardroom_batches_v1';
const MAX_GOALS = 50;
const MAX_BATCHES = 200;

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGoals(rows) {
  const next = rows.slice(-MAX_GOALS);
  localStorage.setItem(GOALS_KEY, JSON.stringify(next));
  try { invoke('kv_set', { key: GOALS_KEY, value: JSON.stringify(next) }).catch(() => {}); } catch { /* browser */ }
}

function readBatches() {
  try {
    const raw = localStorage.getItem(BATCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBatches(rows) {
  const next = rows.slice(-MAX_BATCHES);
  localStorage.setItem(BATCHES_KEY, JSON.stringify(next));
  try { invoke('kv_set', { key: BATCHES_KEY, value: JSON.stringify(next) }).catch(() => {}); } catch { /* browser */ }
}

function dispatchBoardroomEvent() {
  try { window.dispatchEvent(new CustomEvent('alphonso:boardroom_updated')); } catch { /* noop */ }
}

export function createProjectGoal(goal, description = '') {
  const goals = readGoals();
  const existingActive = goals.find((g) => g.status === 'active');
  if (existingActive) {
    existingActive.status = 'paused';
  }
  const goalObj = {
    id: newId('goal'),
    goal: String(goal || '').trim(),
    description: String(description || '').trim(),
    createdAtMs: Date.now(),
    currentBatchNumber: 0,
    status: 'active',
    totalTasksCompleted: 0,
    totalTasksCreated: 0
  };
  goals.push(goalObj);
  writeGoals(goals);
  dispatchBoardroomEvent();
  return goalObj;
}

export function getActiveGoal() {
  return readGoals().find((g) => g.status === 'active') || null;
}

export function listGoals() {
  return readGoals().slice().reverse();
}

export function updateGoal(goalId, updates) {
  const goals = readGoals();
  const idx = goals.findIndex((g) => g.id === goalId);
  if (idx === -1) return null;
  Object.assign(goals[idx], updates);
  writeGoals(goals);
  dispatchBoardroomEvent();
  return goals[idx];
}

export function completeGoal(goalId) {
  return updateGoal(goalId, { status: 'completed' });
}

function detectTemplate(goal) {
  const lower = String(goal || '').toLowerCase();
  if (/dashboard|analytics|admin|chart|graph|metric|stats/.test(lower)) return 'dashboard';
  if (/api|backend|server|endpoint|rest|graphql|microservice/.test(lower)) return 'api';
  if (/mobile|app|react native|flutter|ios|android/.test(lower)) return 'mobile';
  if (/content|social|marketing|campaign|post|blog|article/.test(lower)) return 'content';
  return 'general';
}

const TEMPLATES = {
  dashboard: [
    { title: 'Research analytics libraries and charting tools', agent: 'hector', priority: 'low', description: 'Survey available analytics/charting libraries. Compare features, bundle size, and license.' },
    { title: 'Define data model and schema', agent: 'maria', priority: 'medium', description: 'Define the core data model for the dashboard. Include entities, relationships, and validation rules.' },
    { title: 'Design dashboard layout and components', agent: 'miya', priority: 'medium', description: 'Create wireframes and component hierarchy for the dashboard UI.' },
    { title: 'Implement data layer and API integration', agent: 'alphonso', priority: 'high', description: 'Build the data fetching, caching, and state management layer.' },
    { title: 'Implement dashboard UI components', agent: 'alphonso', priority: 'high', description: 'Build the main dashboard views with charts, tables, and filters.' },
    { title: 'Add real-time data updates', agent: 'alphonso', priority: 'medium', description: 'Implement WebSocket or polling for live data refresh.' },
    { title: 'Security review and input validation', agent: 'marcus', priority: 'medium', description: 'Audit data handling, input sanitization, and access controls.' },
    { title: 'Design export and reporting feature', agent: 'miya', priority: 'low', description: 'Design PDF/CSV export flow and scheduled report generation.' },
    { title: 'Write integration and unit tests', agent: 'alphonso', priority: 'medium', description: 'Cover critical paths with tests. Include data transformation and UI rendering tests.' },
    { title: 'Final integration review', agent: 'jose', priority: 'low', description: 'Review all components together. Check for integration issues and documentation gaps.' }
  ],
  api: [
    { title: 'Define API specification and endpoints', agent: 'maria', priority: 'high', description: 'Create OpenAPI spec with endpoint definitions, request/response schemas, and error codes.' },
    { title: 'Research API best practices and patterns', agent: 'hector', priority: 'low', description: 'Survey REST/GraphQL best practices, rate limiting strategies, and documentation tools.' },
    { title: 'Implement core API endpoints', agent: 'alphonso', priority: 'high', description: 'Build the main CRUD endpoints with validation and error handling.' },
    { title: 'Implement authentication middleware', agent: 'alphonso', priority: 'high', description: 'Add JWT/session auth, rate limiting, and CORS configuration.' },
    { title: 'Security audit of auth and data access', agent: 'marcus', priority: 'medium', description: 'Review authentication flow, token handling, and data access patterns.' },
    { title: 'Write API tests and documentation', agent: 'alphonso', priority: 'medium', description: 'Write endpoint tests, integration tests, and generate API documentation.' },
    { title: 'Performance and load testing', agent: 'nova', priority: 'low', description: 'Identify bottlenecks, test under load, and recommend optimizations.' },
    { title: 'Document API for consumers', agent: 'hector', priority: 'low', description: 'Write developer-friendly API docs with examples and error handling guides.' }
  ],
  mobile: [
    { title: 'Research React Native patterns and libraries', agent: 'hector', priority: 'low', description: 'Survey navigation libraries, state management, and platform-specific patterns.' },
    { title: 'Design app screens and navigation flow', agent: 'miya', priority: 'high', description: 'Create screen wireframes, navigation hierarchy, and interaction patterns.' },
    { title: 'Set up project structure and navigation', agent: 'alphonso', priority: 'medium', description: 'Initialize the app shell with navigation, theme, and base components.' },
    { title: 'Implement core screens', agent: 'alphonso', priority: 'high', description: 'Build the main application screens with data binding.' },
    { title: 'Implement offline support and caching', agent: 'alphonso', priority: 'medium', description: 'Add offline-first data storage and sync when reconnected.' },
    { title: 'Performance profiling and optimization', agent: 'nova', priority: 'low', profile: 'Profile render performance, memory usage, and startup time.' },
    { title: 'Security review of data storage and transport', agent: 'marcus', priority: 'medium', description: 'Audit local storage encryption, API transport security, and deep link handling.' },
    { title: 'Write tests for critical flows', agent: 'alphonso', priority: 'medium', description: 'Cover navigation, data flows, and edge cases with unit and integration tests.' }
  ],
  content: [
    { title: 'Research content strategy and platform algorithms', agent: 'hector', priority: 'medium', description: 'Analyze platform-specific content requirements, hashtags, and posting schedules.' },
    { title: 'Create content brief and brand guidelines', agent: 'miya', priority: 'high', description: 'Define tone, visual style, and content pillars for the campaign.' },
    { title: 'Generate content drafts', agent: 'miya', priority: 'high', description: 'Write post copy, scripts, or article drafts based on the content brief.' },
    { title: 'Generate visual assets', agent: 'miya', priority: 'medium', description: 'Create images, thumbnails, or graphics for the content.' },
    { title: 'Review and approve content', agent: 'marcus', priority: 'medium', description: 'Review content for brand consistency, accuracy, and compliance.' },
    { title: 'Schedule and publish', agent: 'marcus', priority: 'high', description: 'Schedule posts across platforms and verify publishing.' },
    { title: 'Track performance metrics', agent: 'nova', priority: 'low', description: 'Monitor engagement, reach, and conversion metrics.' },
    { title: 'Document content playbook', agent: 'echo', priority: 'low', description: 'Archive what worked, what did not, and recommendations for next campaign.' }
  ],
  general: [
    { title: 'Research requirements and existing solutions', agent: 'hector', priority: 'medium', description: 'Survey the problem space, existing tools, and best practices.' },
    { title: 'Define scope, milestones, and acceptance criteria', agent: 'maria', priority: 'high', description: 'Break down the goal into measurable milestones with clear success criteria.' },
    { title: 'Design approach and architecture', agent: 'miya', priority: 'medium', description: 'Create the high-level architecture, component diagram, and data flow.' },
    { title: 'Implement core functionality', agent: 'alphonso', priority: 'high', description: 'Build the primary feature set that delivers the core value.' },
    { title: 'Security and quality review', agent: 'marcus', priority: 'medium', description: 'Review code quality, security posture, and error handling.' },
    { title: 'Evaluate against goals and metrics', agent: 'nova', priority: 'low', description: 'Score the implementation against the original goals. Identify gaps.' },
    { title: 'Document decisions and learnings', agent: 'echo', priority: 'low', description: 'Preserve architectural decisions, trade-offs, and lessons learned.' }
  ]
};

export function generateBatchRuleBased(goal, completedTasks = []) {
  const template = detectTemplate(goal);
  const tasks = TEMPLATES[template] || TEMPLATES.general;
  const now = Date.now();
  return tasks.map((t, i) => ({
    id: newId('task'),
    title: t.title,
    description: t.description,
    priority: t.priority,
    agent: t.agent,
    status: 'pending',
    batchId: '',
    goalId: '',
    createdAtMs: now + i,
    completedAtMs: null,
    dependsOn: [],
    artifacts: []
  }));
}

function buildLLMPrompt(goal, completedTasks, batchNumber) {
  const completedSummary = completedTasks.length > 0
    ? completedTasks.map((t) => `- [${t.status}] ${t.title} (agent: ${t.agent})`).join('\n')
    : 'No tasks completed yet.';

  return `You are an expert project planner for an AI agent system. Analyze the project goal and completed work, then generate the next batch of approximately 8-10 coding tasks.

PROJECT GOAL: ${goal}
CURRENT BATCH: #${batchNumber}
COMPLETED TASKS:
${completedSummary}

Available agents and their specializations:
- hector: Research, documentation, source verification, API docs
- maria: Requirements, data modeling, roadmap, acceptance criteria
- miya: UI/UX design, creative packages, brand, wireframes
- alphonso: Implementation, coding, build, test, local execution
- marcus: Security audit, release readiness, governance review
- sentinel: Safety monitoring, vulnerability scanning
- nova: Performance analysis, scoring, opportunity assessment
- echo: Memory preservation, documentation, knowledge archival
- jose: Orchestration, integration review, synthesis

Return ONLY a valid JSON object with this exact structure:
{
  "audit_notes": "Brief analysis of current project progress",
  "generation_thoughts": "Why these specific tasks were chosen",
  "tasks": [
    {
      "title": "Clear, actionable task title",
      "description": "What needs to be done and why",
      "priority": "low|medium|high|urgent",
      "agent": "agent_name"
    }
  ]
}

Rules:
1. Each task must be concrete and actionable
2. Assign each task to the most appropriate agent
3. Build logically on completed work — do not repeat completed tasks
4. Priorities: urgent > high > medium > low
5. Include dependencies implicitly through task ordering
6. Aim for 8-10 tasks per batch
7. Return ONLY the JSON object, no markdown fences or extra text`;
}

export async function generateBatchViaLLM(goal, completedTasks = [], batchNumber = 1, endpoint) {
  const model = PREFERRED_MODEL;
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const prompt = buildLLMPrompt(goal, completedTasks, batchNumber);

  const response = await generateOllamaResponse({ endpoint: normalizedEndpoint, model, prompt });
  const text = String(response?.response || '').trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM did not return valid JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed.tasks)) throw new Error('LLM response missing tasks array');

  const now = Date.now();
  const tasks = parsed.tasks.map((t, i) => ({
    id: newId('task'),
    title: String(t.title || `Task ${i + 1}`),
    description: String(t.description || ''),
    priority: ['urgent', 'high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
    agent: String(t.agent || 'alphonso'),
    status: 'pending',
    batchId: '',
    goalId: '',
    createdAtMs: now + i,
    completedAtMs: null,
    dependsOn: [],
    artifacts: []
  }));

  return {
    tasks,
    auditNotes: String(parsed.audit_notes || ''),
    generationThoughts: String(parsed.generation_thoughts || ''),
    generationMode: 'llm_powered'
  };
}

async function checkOllamaAvailable(endpoint) {
  try {
    const { models } = await fetchOllamaModels(normalizeEndpoint(endpoint));
    return Array.isArray(models) && models.length > 0;
  } catch {
    return false;
  }
}

export async function generateBatch(goalId, endpoint) {
  const goals = readGoals();
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) throw new Error(`Goal ${goalId} not found`);

  const allBatches = readBatches();
  const goalBatches = allBatches.filter((b) => b.goalId === goalId);
  const batchNumber = goal.currentBatchNumber + 1;

  const completedTasks = goalBatches
    .flatMap((b) => b.tasks)
    .filter((t) => t.status === 'completed');

  let result;
  let usedLLM = false;

  const ollamaAvailable = await checkOllamaAvailable(endpoint);
  if (ollamaAvailable) {
    try {
      result = await generateBatchViaLLM(goal.goal, completedTasks, batchNumber, endpoint);
      usedLLM = true;
    } catch {
      result = null;
    }
  }

  if (!result) {
    const tasks = generateBatchRuleBased(goal.goal, completedTasks);
    result = {
      tasks,
      auditNotes: `Rule-based generation for: ${goal.goal}`,
      generationThoughts: 'Template-based task decomposition (Ollama unavailable or failed).',
      generationMode: 'rule_based'
    };
  }

  const now = Date.now();
  const batch = {
    id: newId('batch'),
    goalId,
    batchNumber,
    tasks: result.tasks.map((t) => ({ ...t, batchId: '', goalId })),
    generationMode: result.generationMode,
    auditNotes: result.auditNotes,
    generationThoughts: result.generationThoughts,
    createdAtMs: now,
    completedAtMs: null,
    status: 'active'
  };

  batch.tasks.forEach((t) => { t.batchId = batch.id; t.goalId = goalId; });

  allBatches.push(batch);
  writeBatches(allBatches);

  goal.currentBatchNumber = batchNumber;
  goal.totalTasksCreated += batch.tasks.length;
  writeGoals(goals);

  dispatchBoardroomEvent();
  return batch;
}

export function getBatch(goalId, batchNumber) {
  return readBatches().find((b) => b.goalId === goalId && b.batchNumber === batchNumber) || null;
}

export function listBatches(goalId) {
  return readBatches()
    .filter((b) => b.goalId === goalId)
    .sort((a, b) => b.batchNumber - a.batchNumber);
}

export function getActiveBatch(goalId) {
  return readBatches().find((b) => b.goalId === goalId && b.status === 'active') || null;
}

export function getBatchById(batchId) {
  return readBatches().find((b) => b.id === batchId) || null;
}

export function updateTaskStatus(taskId, status, artifacts = []) {
  const batches = readBatches();
  for (const batch of batches) {
    const task = batch.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      if (status === 'completed') {
        task.completedAtMs = Date.now();
        if (artifacts.length > 0) task.artifacts = artifacts;
      }

      const allDone = batch.tasks.every((t) => t.status === 'completed' || t.status === 'failed');
      if (allDone && batch.status === 'active') {
        batch.status = 'completed';
        batch.completedAtMs = Date.now();
      }

      writeBatches(batches);

      const goals = readGoals();
      const goal = goals.find((g) => g.id === batch.goalId);
      if (goal) {
        goal.totalTasksCompleted = batches
          .filter((b) => b.goalId === goal.id)
          .flatMap((b) => b.tasks)
          .filter((t) => t.status === 'completed').length;
        writeGoals(goals);
      }

      dispatchBoardroomEvent();
      return task;
    }
  }
  return null;
}

export function getTaskById(taskId) {
  for (const batch of readBatches()) {
    const task = batch.tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return null;
}

export function isBatchComplete(goalId, batchNumber) {
  const batch = getBatch(goalId, batchNumber);
  if (!batch) return false;
  return batch.tasks.every((t) => t.status === 'completed' || t.status === 'failed');
}

export function getBatchProgress(goalId, batchNumber) {
  const batch = getBatch(goalId, batchNumber);
  if (!batch || batch.tasks.length === 0) {
    return { total: 0, completed: 0, failed: 0, pending: 0, inProgress: 0, percent: 0 };
  }
  const total = batch.tasks.length;
  const completed = batch.tasks.filter((t) => t.status === 'completed').length;
  const failed = batch.tasks.filter((t) => t.status === 'failed').length;
  const pending = batch.tasks.filter((t) => t.status === 'pending').length;
  const inProgress = batch.tasks.filter((t) => t.status === 'in_progress').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, failed, pending, inProgress, percent };
}

export function getGoalProgress(goalId) {
  const batches = listBatches(goalId);
  const allTasks = batches.flatMap((b) => b.tasks);
  const total = allTasks.length;
  const completed = allTasks.filter((t) => t.status === 'completed').length;
  const failed = allTasks.filter((t) => t.status === 'failed').length;
  const pending = allTasks.filter((t) => t.status === 'pending').length;
  const inProgress = allTasks.filter((t) => t.status === 'in_progress').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, failed, pending, inProgress, percent, batchCount: batches.length };
}

export async function advanceToNextBatch(goalId, endpoint) {
  const goal = readGoals().find((g) => g.id === goalId);
  if (!goal) throw new Error(`Goal ${goalId} not found`);
  const activeBatch = getActiveBatch(goalId);
  if (activeBatch) throw new Error('Current batch is still active. Complete all tasks before advancing.');
  return generateBatch(goalId, endpoint);
}
