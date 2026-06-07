import { invoke } from '@tauri-apps/api/core';
import { timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const STORE_KEY = 'alphonso_agent_outputs_v1';
export const AGENT_OUTPUT_SCOPE = 'agent_outputs_v1';

export const AGENT_DEPENDENCIES = Object.freeze({
  hector: [],
  maria: [],
  sentinel: [],
  nova: [],
  jose: [],
  miya: ['hector'],
  alphonso: ['miya'],
  marcus: ['maria'],
  echo: ['hector', 'miya', 'maria', 'marcus', 'nova', 'sentinel', 'alphonso']
});

function readAllOutputs() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllOutputs(allOutputs) {
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
  const flatRows = [];
  for (const [commandId, agents] of Object.entries(allOutputs)) {
    if (agents && typeof agents === 'object') {
      for (const [agentName, output] of Object.entries(agents)) {
        if (output && typeof output === 'object') {
          flatRows.push({ commandId, agentName, ...output });
        }
      }
    }
  }
  void persistScopeRows(AGENT_OUTPUT_SCOPE, flatRows, (row) => ({
    id: `${row.commandId}:${row.agentName}`,
    data: row,
    status: 'recorded',
    confidence: row.confidence || 'inferred',
    verificationState: row.verificationState || 'unverified',
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

export function setAgentOutput(commandId, agentName, output) {
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

export function getAgentOutput(commandId, agentName) {
  if (!commandId || !agentName) return null;
  const allOutputs = readAllOutputs();
  return allOutputs[commandId]?.[agentName] || null;
}

export function getAllAgentOutputs(commandId) {
  if (!commandId) return {};
  const allOutputs = readAllOutputs();
  return allOutputs[commandId] || {};
}

export function getPriorOutputs(commandId, agentName) {
  if (!commandId || !agentName) return {};
  const deps = AGENT_DEPENDENCIES[agentName] || [];
  if (deps.length === 0) return {};
  const allOutputs = readAllOutputs();
  const commandOutputs = allOutputs[commandId] || {};
  const result = {};
  for (const dep of deps) {
    if (commandOutputs[dep]) {
      result[dep] = commandOutputs[dep];
    }
  }
  return result;
}

export function clearAgentOutputs(commandId) {
  if (!commandId) return;
  const allOutputs = readAllOutputs();
  delete allOutputs[commandId];
  writeAllOutputs(allOutputs);
}

export function buildExecutionPlan(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { waves: [], assignmentMap: {} };
  }
  const assignmentMap = {};
  for (const assignment of assignments) {
    const agent = assignment?.agent;
    if (agent) assignmentMap[agent] = assignment;
  }
  const agents = Object.keys(assignmentMap);
  const completed = new Set();
  const waves = [];
  let safety = 0;
  while (completed.size < agents.length && safety < 20) {
    const wave = [];
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
