import { timestampMs } from './trustModel';
import { listMemory } from './unifiedMemoryService';

const METRICS_KEY = 'alphonso_agent_metrics_v1';
const MAX_METRICS_ENTRIES = 500;

function readMetrics() {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeMetrics(entries) {
  localStorage.setItem(METRICS_KEY, JSON.stringify(entries.slice(-MAX_METRICS_ENTRIES)));
}

export function recordAgentExecution({ agent, command, success, confidence, filesWritten, validationPassed, iterations, durationMs, error }) {
  const entry = {
    id: `metric-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestampMs: timestampMs(),
    agent: agent || 'alphonso',
    command: String(command || '').slice(0, 200),
    success: success === true,
    confidence: confidence || 50,
    filesWritten: filesWritten || 0,
    validationPassed: validationPassed === true,
    iterations: iterations || 1,
    durationMs: durationMs || 0,
    error: error ? String(error).slice(0, 500) : null
  };

  const entries = readMetrics();
  entries.push(entry);
  writeMetrics(entries);
  return entry;
}

export function getAgentMetrics(filters = {}) {
  const entries = readMetrics();
  const filtered = entries.filter((e) => {
    if (filters.agent && e.agent !== filters.agent) return false;
    if (filters.since && e.timestampMs < filters.since) return false;
    if (filters.until && e.timestampMs > filters.until) return false;
    return true;
  });

  if (filtered.length === 0) {
    return {
      totalExecutions: 0,
      successRate: 0,
      avgConfidence: 0,
      avgFilesPerExecution: 0,
      avgIterations: 0,
      avgDurationMs: 0,
      validationPassRate: 0,
      topCommands: [],
      errorPatterns: [],
      byAgent: {},
      trend: []
    };
  }

  const totalExecutions = filtered.length;
  const successCount = filtered.filter((e) => e.success).length;
  const validationCount = filtered.filter((e) => e.validationPassed).length;
  const totalConfidence = filtered.reduce((sum, e) => sum + (e.confidence || 0), 0);
  const totalFiles = filtered.reduce((sum, e) => sum + (e.filesWritten || 0), 0);
  const totalIterations = filtered.reduce((sum, e) => sum + (e.iterations || 1), 0);
  const totalDuration = filtered.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  // Top commands (most common prefixes)
  const commandPrefixes = {};
  for (const e of filtered) {
    const prefix = e.command.split(' ').slice(0, 3).join(' ').toLowerCase();
    commandPrefixes[prefix] = (commandPrefixes[prefix] || 0) + 1;
  }
  const topCommands = Object.entries(commandPrefixes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cmd, count]) => ({ command: cmd, count }));

  // Error patterns
  const errorPatterns = {};
  for (const e of filtered) {
    if (e.error) {
      const key = e.error.slice(0, 80).toLowerCase();
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    }
  }
  const topErrors = Object.entries(errorPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([err, count]) => ({ error: err, count }));

  // By agent
  const byAgent = {};
  for (const e of filtered) {
    if (!byAgent[e.agent]) {
      byAgent[e.agent] = { total: 0, success: 0, avgConfidence: 0, totalConfidence: 0 };
    }
    byAgent[e.agent].total++;
    if (e.success) byAgent[e.agent].success++;
    byAgent[e.agent].totalConfidence += e.confidence || 0;
  }
  for (const [agent, data] of Object.entries(byAgent)) {
    byAgent[agent].successRate = Math.round((data.success / data.total) * 100);
    byAgent[agent].avgConfidence = Math.round(data.totalConfidence / data.total);
  }

  // Trend (last 7 days)
  const now = Date.now();
  const dayMs = 86_400_000;
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - (i + 1) * dayMs;
    const dayEnd = now - i * dayMs;
    const dayEntries = filtered.filter((e) => e.timestampMs >= dayStart && e.timestampMs < dayEnd);
    trend.push({
      date: new Date(dayStart).toISOString().slice(0, 10),
      executions: dayEntries.length,
      success: dayEntries.filter((e) => e.success).length,
      avgConfidence: dayEntries.length > 0 ? Math.round(dayEntries.reduce((s, e) => s + (e.confidence || 0), 0) / dayEntries.length) : 0
    });
  }

  return {
    totalExecutions,
    successRate: Math.round((successCount / totalExecutions) * 100),
    avgConfidence: Math.round(totalConfidence / totalExecutions),
    avgFilesPerExecution: Math.round((totalFiles / totalExecutions) * 10) / 10,
    avgIterations: Math.round((totalIterations / totalExecutions) * 10) / 10,
    avgDurationMs: Math.round(totalDuration / totalExecutions),
    validationPassRate: Math.round((validationCount / totalExecutions) * 100),
    topCommands,
    errorPatterns: topErrors,
    byAgent,
    trend
  };
}

export function clearAgentMetrics() {
  localStorage.removeItem(METRICS_KEY);
}

export function exportAgentMetrics() {
  return readMetrics();
}
