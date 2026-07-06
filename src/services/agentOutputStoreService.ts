import { invoke } from '@tauri-apps/api/core';
import { timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const STORE_KEY = 'alphonso_agent_outputs_v1';
export const AGENT_OUTPUT_SCOPE = 'agent_outputs_v1';

export const AGENT_DEPENDENCIES: Record<string, string[]> = Object.freeze({
  hector: [],
  maria: [],
  sentinel: [],
  nova: [],
  jose: [],
  miya: ['hector'],
  alphonso: ['miya'],
  marcus: ['maria'],
  echo: ['hector', 'miya', 'maria', 'marcus', 'nova', 'sentinel', 'alphonso']
}) as Record<string, string[]>;

interface AgentOutput {
  [key: string]: unknown;
  agentName?: string;
  storedAtMs?: number;
}

interface AllOutputs {
  [commandId: string]: Record<string, AgentOutput>;
}

function readAllOutputs(): AllOutputs {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as AllOutputs) : {};
  } catch {
    return {};
  }
}

function writeAllOutputs(allOutputs: AllOutputs): void {
  try {
    invoke('kv_set', { key: STORE_KEY, value: JSON.stringify(allOutputs) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(allOutputs));
  } catch {
    // localStorage unavailable
  }
  const flatRows: Array<{ commandId: string; agentName: string; [key: string]: unknown }> = [];
  for (const [commandId, agents] of Object.entries(allOutputs)) {
    if (agents && typeof agents === 'object') {
      for (const [agentName, output] of Object.entries(agents)) {
        if (output && typeof output === 'object') {
          flatRows.push({ commandId, agentName, ...output });
        }
      }
    }
  }
  void persistScopeRows(AGENT_OUTPUT_SCOPE, flatRows, (row: Record<string, unknown>) => ({
    id: `${row.commandId}:${row.agentName}`,
    data: row,
    status: 'recorded',
    confidence: (row.confidence as string) || 'inferred',
    verificationState: (row.verificationState as string) || 'unverified',
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function setAgentOutput(commandId: string, agentName: string, output: AgentOutput): AgentOutput | null {
  if (!commandId || !agentName || !output) return null;
  const allOutputs = readAllOutputs();
  if (!allOutputs[commandId]) allOutputs[commandId] = {};
  allOutputs[commandId][agentName] = {
    ...output,
    agentName,
    storedAtMs: timestampMs()
  };
  writeAllOutputs(allOutputs);
  return allOutputs[commandId][agentName];
}

export function getAgentOutput(commandId: string, agentName: string): AgentOutput | null {
  if (!commandId || !agentName) return null;
  const allOutputs = readAllOutputs();
  return allOutputs[commandId]?.[agentName] || null;
}

export function getAllAgentOutputs(commandId: string): Record<string, AgentOutput> {
  if (!commandId) return {};
  const allOutputs = readAllOutputs();
  return allOutputs[commandId] || {};
}

export function getPriorOutputs(commandId: string, agentName: string): Record<string, AgentOutput> {
  if (!commandId || !agentName) return {};
  const deps = AGENT_DEPENDENCIES[agentName] || [];
  if (deps.length === 0) return {};
  const allOutputs = readAllOutputs();
  const commandOutputs = allOutputs[commandId] || {};
  const result: Record<string, AgentOutput> = {};
  for (const dep of deps) {
    if (commandOutputs[dep]) {
      result[dep] = commandOutputs[dep];
    }
  }
  return result;
}

export function clearAgentOutputs(commandId: string): void {
  if (!commandId) return;
  const allOutputs = readAllOutputs();
  delete allOutputs[commandId];
  writeAllOutputs(allOutputs);
}

interface Assignment {
  agent?: string;
  [key: string]: unknown;
}

export function buildExecutionPlan(assignments: Assignment[]): { waves: string[][]; assignmentMap: Record<string, Assignment> } {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { waves: [], assignmentMap: {} };
  }
  const assignmentMap: Record<string, Assignment> = {};
  for (const assignment of assignments) {
    const agent = assignment?.agent;
    if (agent) assignmentMap[agent] = assignment;
  }
  const agents = Object.keys(assignmentMap);
  const completed = new Set<string>();
  const waves: string[][] = [];
  let safety = 0;
  while (completed.size < agents.length && safety < 20) {
    const wave: string[] = [];
    for (const agent of agents) {
      if (completed.has(agent)) continue;
      const deps = AGENT_DEPENDENCIES[agent] || [];
      const depsMet = deps.every((dep) => completed.has(dep) || !assignmentMap[dep]);
      if (depsMet) wave.push(agent);
    }
    if (wave.length === 0) break;
    waves.push(wave);
    for (const agent of wave) completed.add(agent);
    safety += 1;
  }
  return { waves, assignmentMap };
}

interface WiringWarning {
  agent: string;
  missingDependency: string;
  message: string;
}

export function validateWiring(commandId: string, assignments: Assignment[]): { valid: boolean; warnings: WiringWarning[] } {
  if (!commandId || !Array.isArray(assignments)) return { valid: true, warnings: [] };
  const warnings: WiringWarning[] = [];
  const allOutputs = readAllOutputs();
  const commandOutputs = allOutputs[commandId] || {};
  const agentNames = assignments.map((a) => a?.agent).filter(Boolean) as string[];
  for (const assignment of assignments) {
    const agent = assignment?.agent;
    if (!agent) continue;
    const deps = AGENT_DEPENDENCIES[agent] || [];
    for (const dep of deps) {
      if (agentNames.includes(dep) && !commandOutputs[dep]) {
        warnings.push({
          agent,
          missingDependency: dep,
          message: `${agent} expects output from ${dep} but ${dep} has not stored output yet for command ${commandId}`
        });
      }
    }
  }
  return { valid: warnings.length === 0, warnings };
}
