export const OPERATIONAL_MODES = Object.freeze([
  {
    id: 'planning',
    label: 'Planning Mode',
    emphasis: ['brainstorming', 'decomposition', 'architecture'],
    allowsExecution: false
  },
  {
    id: 'build',
    label: 'Build Mode',
    emphasis: ['implementation', 'file generation', 'testing'],
    allowsExecution: true
  },
  {
    id: 'audit',
    label: 'Audit Mode',
    emphasis: ['review', 'verification', 'security'],
    allowsExecution: false
  },
  {
    id: 'research',
    label: 'Research Mode',
    emphasis: ['docs', 'apis', 'comparison'],
    allowsExecution: false
  },
  {
    id: 'deployment',
    label: 'Deployment Mode',
    emphasis: ['release checks', 'rollback preparation', 'ci_cd'],
    allowsExecution: true
  }
]);

const MODE_KEY = 'alphonso_operational_mode_v1';

export function getOperationalMode() {
  const stored = localStorage.getItem(MODE_KEY) || 'planning';
  return OPERATIONAL_MODES.find((mode) => mode.id === stored) || OPERATIONAL_MODES[0];
}

export function setOperationalMode(modeId) {
  const match = OPERATIONAL_MODES.find((mode) => mode.id === modeId) || OPERATIONAL_MODES[0];
  localStorage.setItem(MODE_KEY, match.id);
  return match;
}

