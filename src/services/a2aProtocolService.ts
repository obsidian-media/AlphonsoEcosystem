import { sendAgentMessage } from './agentBusService';
import { durableGet, durableSet } from '../lib/durableStore';

const STORAGE_KEY = 'alphonso_a2a_tasks_v1';

export interface A2ATask {
  delegateId: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  context: {
    workspaceId?: string;
    sessionId?: string;
    documents?: string[];
    metadata?: Record<string, unknown>;
  };
  requirements?: {
    capabilities?: string[];
    maxTokens?: number;
  };
  status: 'pending' | 'accepted' | 'running' | 'completed' | 'failed';
  result?: unknown;
  logs: string[];
  createdAt: string;
  completedAt?: string;
}

function readTasks(): A2ATask[] {
  try {
    const raw = durableGet(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks: A2ATask[]): void {
  durableSet(STORAGE_KEY, JSON.stringify(tasks.slice(-500)));
}

function generateDelegateId(): string {
  return `a2a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function delegate(
  from: string,
  to: string,
  task: string,
  context: A2ATask['context'],
  requirements?: A2ATask['requirements']
): A2ATask {
  const delegateId = generateDelegateId();
  const record: A2ATask = {
    delegateId,
    fromAgent: from,
    toAgent: to,
    task,
    context: context || {},
    requirements,
    status: 'pending',
    logs: [`[${new Date().toISOString()}] Task delegated from ${from} to ${to}`],
    createdAt: new Date().toISOString(),
  };

  const tasks = readTasks();
  tasks.push(record);
  writeTasks(tasks);

  // Send via agent bus
  try {
    sendAgentMessage(from, to, task, { delegateId, ...context });
  } catch {
    // non-blocking
  }

  return record;
}

export function getTaskStatus(delegateId: string): A2ATask | null {
  return readTasks().find(t => t.delegateId === delegateId) ?? null;
}

export function updateTaskResult(
  delegateId: string,
  result: unknown,
  logs: string[],
  error?: string
): void {
  const tasks = readTasks().map(t => {
    if (t.delegateId !== delegateId) return t;
    return {
      ...t,
      result,
      logs: [...t.logs, ...logs],
      status: (error ? 'failed' : 'completed') as A2ATask['status'],
      completedAt: new Date().toISOString(),
    };
  });
  writeTasks(tasks);
}

export function listActiveTasks(): A2ATask[] {
  return readTasks().filter(t => t.status === 'pending' || t.status === 'running' || t.status === 'accepted');
}

export function listTasksByAgent(agentId: string): A2ATask[] {
  return readTasks().filter(t => t.fromAgent === agentId || t.toAgent === agentId);
}
