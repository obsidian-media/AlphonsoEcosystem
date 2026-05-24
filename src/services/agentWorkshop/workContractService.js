const CONTRACT_KEY = 'alphonso_work_contracts_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(CONTRACT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  localStorage.setItem(CONTRACT_KEY, JSON.stringify(rows.slice(-1200)));
}

export function createWorkContractDraft({
  traceId,
  projectId,
  draftedBy = 'jose',
  objective,
  allowedScope = [],
  forbiddenScope = [],
  expectedOutput = '',
  riskLevel = 'medium',
  validationRequirements = [],
  rollbackExpectations = []
}) {
  const draft = {
    id: `contract-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    traceId: traceId || `workflow-${Date.now()}`,
    projectId: projectId || null,
    draftedBy,
    objective: objective || 'Undefined objective',
    allowedScope,
    forbiddenScope,
    expectedOutput,
    riskLevel,
    validationRequirements,
    rollbackExpectations,
    state: 'drafted',
    editedByShayan: false,
    signedByShayan: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
  const rows = readRows();
  rows.push(draft);
  writeRows(rows);
  return draft;
}

export function updateWorkContract(contractId, patch = {}) {
  const rows = readRows();
  const next = rows.map((row) => (
    row.id === contractId
      ? { ...row, ...patch, editedByShayan: true, updatedAt: new Date().toISOString() }
      : row
  ));
  writeRows(next);
  return next.find((row) => row.id === contractId) || null;
}

export function signWorkContract(contractId) {
  return updateWorkContract(contractId, { state: 'signed', signedByShayan: true });
}

export function archiveWorkContract(contractId) {
  return updateWorkContract(contractId, { state: 'archived', archived: true });
}

export function listWorkContracts(filters = {}) {
  return readRows().filter((row) => {
    if (filters.projectId && row.projectId !== filters.projectId) return false;
    if (filters.traceId && row.traceId !== filters.traceId) return false;
    if (filters.state && row.state !== filters.state) return false;
    return true;
  }).slice().reverse();
}

