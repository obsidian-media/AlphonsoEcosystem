import { timestampMs } from './trustModel';
import { listMemory } from './unifiedMemoryService';
import { getAgentMetrics } from './agentMetricsService';

const PROACTIVE_STATE_KEY = 'alphonso_proactive_state_v1';
const CHECK_INTERVAL_MS = 60_000;
const SUGGESTION_COOLDOWN_MS = 300_000;
const MAX_SUGGESTION_HISTORY = 50;

interface SuggestionHistory {
  type: string;
  message: string;
  timestampMs: number;
}

interface ProactiveState {
  lastCheckMs: number;
  suggestionHistory: SuggestionHistory[];
  enabled: boolean;
}

export interface SuggestionAction {
  label: string;
  command: string | null;
  action?: string;
}

export interface ProactiveSuggestion {
  type: string;
  priority: string;
  title: string;
  message: string;
  actions: SuggestionAction[];
}

function readState(): ProactiveState {
  try {
    const raw = localStorage.getItem(PROACTIVE_STATE_KEY);
    return raw ? JSON.parse(raw) : { lastCheckMs: 0, suggestionHistory: [], enabled: true };
  } catch {
    return { lastCheckMs: 0, suggestionHistory: [], enabled: true };
  }
}

function writeState(state: ProactiveState): void {
  localStorage.setItem(PROACTIVE_STATE_KEY, JSON.stringify(state));
}

function hasRecentSuggestion(type: string): boolean {
  const state = readState();
  const recent = state.suggestionHistory.filter((s) => s.type === type && timestampMs() - s.timestampMs < SUGGESTION_COOLDOWN_MS);
  return recent.length > 0;
}

function recordSuggestion(type: string, message: string): void {
  const state = readState();
  state.suggestionHistory.push({ type, message, timestampMs: timestampMs() });
  state.suggestionHistory = state.suggestionHistory.slice(-MAX_SUGGESTION_HISTORY);
  writeState(state);
}

// ── Proactive Checks ────────────────────────────────────────────────────────

function checkIdleTime(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('idle')) return null;
  const lastActivity = Math.max(
    ...listMemory().map((m) => m.timestampMs || 0),
    0
  );
  const idleMs = timestampMs() - lastActivity;
  const idleMinutes = Math.round(idleMs / 60_000);

  if (idleMinutes > 15 && idleMinutes < 120) {
    recordSuggestion('idle', `You've been idle for ${idleMinutes} minutes`);
    return {
      type: 'idle',
      priority: 'low',
      title: 'Want me to work on something?',
      message: `You haven't sent a command in ${idleMinutes} minutes. I can review your project, check for outdated dependencies, or suggest improvements.`,
      actions: [
        { label: 'Review project', command: '/jose review my project for improvements' },
        { label: 'Check dependencies', command: '/jose check for outdated dependencies' },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

function checkFailedBuilds(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('failed_build')) return null;
  const metrics = getAgentMetrics({ since: timestampMs() - 3600_000 });
  const recentFailures = metrics.errorPatterns.filter((e) =>
    e.error.includes('build') || e.error.includes('compil') || e.error.includes('syntax')
  );

  if (recentFailures.length > 0) {
    recordSuggestion('failed_build', `Build failures detected`);
    return {
      type: 'failed_build',
      priority: 'high',
      title: 'Build failures detected',
      message: `I noticed ${recentFailures.length} build error(s) in the last hour. Want me to investigate and fix them?`,
      actions: [
        { label: 'Fix build errors', command: `/jose fix the build errors: ${recentFailures[0].error.slice(0, 80)}` },
        { label: 'Show errors', command: '/jose show me the recent build errors' },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

function checkHighIterationTasks(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('high_iterations')) return null;
  const metrics = getAgentMetrics({ since: timestampMs() - 3600_000 });

  if (metrics.avgIterations > 2.5) {
    recordSuggestion('high_iterations', `High iteration count: ${metrics.avgIterations}`);
    return {
      type: 'high_iterations',
      priority: 'medium',
      title: 'Tasks taking many iterations',
      message: `Your recent tasks averaged ${metrics.avgIterations} iterations each. This might mean the prompts need refinement or the tasks are complex.`,
      actions: [
        { label: 'Show metrics', command: '/jose show me my agent performance metrics' },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

function checkLowConfidence(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('low_confidence')) return null;
  const metrics = getAgentMetrics({ since: timestampMs() - 3600_000 });

  if (metrics.avgConfidence < 50 && metrics.totalExecutions > 3) {
    recordSuggestion('low_confidence', `Low confidence: ${metrics.avgConfidence}%`);
    return {
      type: 'low_confidence',
      priority: 'medium',
      title: 'Low agent confidence',
      message: `Your agent's average confidence is ${metrics.avgConfidence}%. This means it's often unsure about its output. Try being more specific in your commands.`,
      actions: [
        { label: 'Show metrics', command: '/jose show me my agent performance metrics' },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

function checkValidationFailures(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('validation_failure')) return null;
  const metrics = getAgentMetrics({ since: timestampMs() - 3600_000 });

  if (metrics.validationPassRate < 50 && metrics.totalExecutions > 2) {
    recordSuggestion('validation_failure', `Validation pass rate: ${metrics.validationPassRate}%`);
    return {
      type: 'validation_failure',
      priority: 'high',
      title: 'Build validation failing',
      message: `Only ${metrics.validationPassRate}% of recent code generations passed build validation. The agent may need better context or the project setup might have issues.`,
      actions: [
        { label: 'Review project', command: '/jose review my project setup for issues' },
        { label: 'Show metrics', command: '/jose show me validation details' },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

function checkUnusedMemory(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('unused_memory')) return null;
  const memoryItems = listMemory();
  const oldItems = memoryItems.filter((m) => timestampMs() - m.timestampMs > 7 * 86_400_000);

  if (oldItems.length > 20) {
    recordSuggestion('unused_memory', `${oldItems.length} old memory items`);
    return {
      type: 'unused_memory',
      priority: 'low',
      title: 'Memory cleanup suggestion',
      message: `You have ${oldItems.length} memory items older than 7 days. Consider backing up or cleaning them to keep search fast.`,
      actions: [
        { label: 'Export backup', command: null, action: 'export_backup' },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

function checkProjectStaleness(): ProactiveSuggestion | null {
  if (hasRecentSuggestion('project_stale')) return null;
  const memoryItems = listMemory({ category: 'code_generation' });
  const lastBuild = memoryItems.reduce((max, m) => Math.max(max, m.timestampMs || 0), 0);
  const daysSinceBuild = lastBuild ? Math.round((timestampMs() - lastBuild) / 86_400_000) : 999;

  if (daysSinceBuild > 3) {
    recordSuggestion('project_stale', `No builds in ${daysSinceBuild} days`);
    return {
      type: 'project_stale',
      priority: 'low',
      title: 'Project hasn\'t been built recently',
      message: `It's been ${daysSinceBuild} days since the last code generation. Want to pick up where you left off?`,
      actions: [
        { label: 'Show recent work', command: '/jose show me my recent projects' },
        { label: 'Start new project', command: null },
        { label: 'Dismiss', command: null }
      ]
    };
  }
  return null;
}

// ── Main Proactive Engine ───────────────────────────────────────────────────

export function runProactiveCheck(): ProactiveSuggestion | null {
  const state = readState();
  if (!state.enabled) return null;

  state.lastCheckMs = timestampMs();
  writeState(state);

  const checks: Array<() => ProactiveSuggestion | null> = [
    checkFailedBuilds,
    checkValidationFailures,
    checkHighIterationTasks,
    checkLowConfidence,
    checkProjectStaleness,
    checkIdleTime,
    checkUnusedMemory
  ];

  for (const check of checks) {
    const result = check();
    if (result) return result;
  }

  return null;
}

export function getProactiveState(): ProactiveState {
  return readState();
}

export function setProactiveEnabled(enabled: boolean): void {
  const state = readState();
  state.enabled = enabled;
  writeState(state);
}

export function clearProactiveHistory(): void {
  const state = readState();
  state.suggestionHistory = [];
  writeState(state);
}

export function startProactiveWatcher(onSuggestion: (suggestion: ProactiveSuggestion) => void): () => void {
  const interval = setInterval(() => {
    const suggestion = runProactiveCheck();
    if (suggestion) {
      onSuggestion(suggestion);
    }
  }, CHECK_INTERVAL_MS);

  const initialTimeout = setTimeout(() => {
    const suggestion = runProactiveCheck();
    if (suggestion) onSuggestion(suggestion);
  }, 30_000);

  return () => {
    clearInterval(interval);
    clearTimeout(initialTimeout);
  };
}
