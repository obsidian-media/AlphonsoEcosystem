const PROJECT_DNA_KEY = 'alphonso_project_dna_v1';

function readRows() {
  try {
    const raw = localStorage.getItem(PROJECT_DNA_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(rows) {
  localStorage.setItem(PROJECT_DNA_KEY, JSON.stringify(rows.slice(-200)));
}

export function createProjectDNA(payload = {}) {
  const dna = {
    id: payload.id || `dna-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    projectId: payload.projectId || null,
    architecture: payload.architecture || '',
    codingStandards: payload.codingStandards || '',
    stack: payload.stack || '',
    deploymentModel: payload.deploymentModel || '',
    namingConventions: payload.namingConventions || '',
    businessGoals: payload.businessGoals || '',
    designLanguage: payload.designLanguage || '',
    constraints: payload.constraints || [],
    securityRules: payload.securityRules || [],
    relevantFilesByAgent: payload.relevantFilesByAgent || {},
    memoryHints: payload.memoryHints || [],
    updatedAt: new Date().toISOString()
  };
  const rows = readRows();
  const next = rows.filter((item) => item.projectId !== dna.projectId);
  next.push(dna);
  writeRows(next);
  return dna;
}

export function getProjectDNA(projectId) {
  return readRows().find((item) => item.projectId === projectId) || null;
}

