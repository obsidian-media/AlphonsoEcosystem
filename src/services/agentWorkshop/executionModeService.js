const MODE_KEY = 'alphonso_agent_execution_mode_v1';
const EXECUTION_APPROVAL_KEY = 'alphonso_execution_mode_approval_v1';

export const AGENT_MODES = Object.freeze({
  PROPOSAL: 'proposal',
  EXECUTION: 'execution'
});

export function getAgentMode() {
  const mode = localStorage.getItem(MODE_KEY) || AGENT_MODES.PROPOSAL;
  return mode === AGENT_MODES.EXECUTION ? AGENT_MODES.EXECUTION : AGENT_MODES.PROPOSAL;
}

export function setAgentMode(mode) {
  const next = mode === AGENT_MODES.EXECUTION ? AGENT_MODES.EXECUTION : AGENT_MODES.PROPOSAL;
  localStorage.setItem(MODE_KEY, next);
  return next;
}

export function isReadOnlyDefault() {
  return getAgentMode() === AGENT_MODES.PROPOSAL;
}

export function canExecuteAction({ approved = false, audited = false, verified = false, dependenciesChecked = false } = {}) {
  if (getAgentMode() !== AGENT_MODES.EXECUTION) {
    return { ok: false, reason: 'System is in Proposal Mode (read-only by default).' };
  }
  if (!approved) return { ok: false, reason: 'Approval is required before execution.' };
  if (!audited) return { ok: false, reason: 'Audit gate has not passed.' };
  if (!verified) return { ok: false, reason: 'Verification gate has not passed.' };
  if (!dependenciesChecked) return { ok: false, reason: 'Dependency checks are incomplete.' };
  return { ok: true, reason: null };
}

export function setExecutionApprovalState(state = {}) {
  localStorage.setItem(EXECUTION_APPROVAL_KEY, JSON.stringify({
    approved: Boolean(state.approved),
    audited: Boolean(state.audited),
    verified: Boolean(state.verified),
    dependenciesChecked: Boolean(state.dependenciesChecked),
    updatedAt: new Date().toISOString()
  }));
}

export function getExecutionApprovalState() {
  try {
    const raw = localStorage.getItem(EXECUTION_APPROVAL_KEY);
    return raw
      ? JSON.parse(raw)
      : { approved: false, audited: false, verified: false, dependenciesChecked: false, updatedAt: null };
  } catch {
    return { approved: false, audited: false, verified: false, dependenciesChecked: false, updatedAt: null };
  }
}

