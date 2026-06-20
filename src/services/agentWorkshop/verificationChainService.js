const CHAIN_KEY = 'alphonso_verification_chains_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(CHAIN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  localStorage.setItem(CHAIN_KEY, JSON.stringify(rows.slice(-800)));
}

export function createVerificationChain({ traceId, projectId, name = 'default_chain', stages = [] }) {
  const chain = {
    id: `vchain-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    traceId: traceId || `workflow-${Date.now()}`,
    projectId: projectId || null,
    name,
    stages: stages.map((stage, index) => ({
      id: stage.id || `stage-${index + 1}`,
      agentId: stage.agentId,
      action: stage.action,
      state: stage.state || 'pending',
      notes: stage.notes || ''
    })),
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
  const rows = readRows();
  rows.push(chain);
  writeRows(rows);
  return chain;
}

export function updateVerificationStage(chainId, stageId, patch = {}) {
  const rows = readRows();
  const next = rows.map((row) => {
    if (row.id !== chainId) return row;
    return {
      ...row,
      stages: row.stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
      updatedAt: new Date().toISOString()
    };
  });
  writeRows(next);
  return next.find((row) => row.id === chainId) || null;
}

export function listVerificationChains(filters = {}) {
  return readRows().filter((row) => {
    if (filters.projectId && row.projectId !== filters.projectId) return false;
    if (filters.traceId && row.traceId !== filters.traceId) return false;
    return true;
  }).slice().reverse();
}

export function createDefaultCrossVerificationChain({ traceId, projectId }) {
  return createVerificationChain({
    traceId,
    projectId,
    name: 'ui_audit_runtime_integration',
    stages: [
      { agentId: 'miya', action: 'generate_ui_proposal', state: 'completed', notes: 'UI proposal drafted.' },
      { agentId: 'marcus', action: 'audit_accessibility_performance', state: 'pending', notes: 'Awaiting audit execution.' },
      { agentId: 'alphonso', action: 'verify_runtime_build', state: 'pending', notes: 'Awaiting runtime/build verification.' },
      { agentId: 'jose', action: 'approve_integration', state: 'pending', notes: 'Final orchestration approval pending.' }
    ]
  });
}

