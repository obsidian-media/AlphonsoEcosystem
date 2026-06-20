const PROPOSAL_KEY = 'alphonso_diff_first_proposals_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(PROPOSAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  localStorage.setItem(PROPOSAL_KEY, JSON.stringify(rows.slice(-1200)));
}

export function createDiffProposal(payload = {}) {
  const proposal = {
    id: payload.id || `proposal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    traceId: payload.traceId || `workflow-${Date.now()}`,
    agentId: payload.agentId || 'unknown',
    title: payload.title || 'Proposed changes',
    createdAt: payload.createdAt || new Date().toISOString(),
    status: payload.status || 'proposed',
    summary: payload.summary || '',
    proposedDiffs: Array.isArray(payload.proposedDiffs) ? payload.proposedDiffs : [],
    relatedFiles: Array.isArray(payload.relatedFiles) ? payload.relatedFiles : [],
    rollbackPlan: payload.rollbackPlan || 'Revert proposal by id before execution.',
    requiresApproval: payload.requiresApproval !== false,
    verificationState: payload.verificationState || 'unverified'
  };
  const rows = readRows();
  rows.push(proposal);
  writeRows(rows);
  return proposal;
}

export function listDiffProposals() {
  return readRows().slice().reverse();
}

export function updateDiffProposalStatus(id, status) {
  const rows = readRows();
  const next = rows.map((row) => (row.id === id ? { ...row, status, updatedAt: new Date().toISOString() } : row));
  writeRows(next);
  return next.find((row) => row.id === id) || null;
}

