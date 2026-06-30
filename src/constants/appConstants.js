// VOICE_STATES inlined here to break circular module dependency.
// Do NOT re-import from voiceService — that import chain causes a TDZ crash
// in the bundled output (Rollup cannot safely order the evaluation).
const VOICE_STATES = {
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  PERMISSION_GRANTED: 'permission_granted',
  LISTENING: 'listening',
  STOPPED: 'stopped',
  PERMISSION_DENIED: 'permission_denied',
  NO_MICROPHONE: 'no_microphone',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
};

export const INITIAL_CONVERSATION_ID = 'default-session';
export const COACH_LAYOUT_KEY = 'alphonso_coach_layout_v1';
export const COACH_CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export const VERIFICATION_LOG_CAP = 250;
export const AUDIT_LOG_FETCH_LIMIT = 200;
export const SNAPSHOT_HISTORY_CAP = 40;
export const COPY_RESET_MS = 1600;
export const WORKSPACE_PROOF_TIMEOUT_MS = 1200;
export const SYMBOL_INDEX_FILE_LIMIT = 500;
export const SCREEN_OBSERVER_INTERVAL_MS = 5000;
export const MEMORY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const COACH_PAUSE_MS = 60000;

export const themeClassFromSettings = (settings) => {
  if (settings.environmentTheme === 'orchestrator_gold') return 'theme-orchestrator-gold';
  if (settings.environmentTheme === 'neon_studio') return 'theme-neon-studio';
  if (settings.environmentTheme === 'minimal_runtime') return 'theme-minimal-runtime';
  return 'theme-deep-space';
};

export function getCompanionState({
  ollamaStatus,
  voiceStatus,
  isGeneratingResponse,
  lastTaskCompletedAt,
  selectedModelMissing,
  privacyModeActive,
  approvalModeActive,
  approvalRequiredNotice
}) {
  if (approvalModeActive && approvalRequiredNotice) {
    return { state: 'approval_required', message: 'Approval required before action.' };
  }

  if (voiceStatus.state === VOICE_STATES.LISTENING) {
    return { state: 'listening', message: 'Listening...' };
  }

  if ([
    VOICE_STATES.PERMISSION_DENIED,
    VOICE_STATES.NO_MICROPHONE,
    VOICE_STATES.UNSUPPORTED,
    VOICE_STATES.ERROR
  ].includes(voiceStatus.state)) {
    return { state: 'warning', message: voiceStatus.message };
  }

  if (voiceStatus.state === VOICE_STATES.REQUESTING_PERMISSION) {
    return { state: 'thinking', message: 'Checking microphone permission.' };
  }

  if (selectedModelMissing) {
    return { state: 'warning', message: 'Selected model is missing.' };
  }

  if (['not_running', 'cors', 'timeout', 'disconnected'].includes(ollamaStatus.state)) {
    return { state: 'warning', message: 'Ollama is disconnected.' };
  }

  if (ollamaStatus.state === 'connecting') {
    return { state: 'thinking', message: 'Checking Ollama.' };
  }

  if (isGeneratingResponse) {
    return { state: 'thinking', message: 'Thinking...' };
  }

  if (lastTaskCompletedAt && Date.now() - lastTaskCompletedAt < 5000) {
    return { state: 'task_complete', message: 'Task complete.' };
  }

  if (privacyModeActive) {
    return { state: 'privacy_shield_active', message: 'Privacy shield active.' };
  }

  if (ollamaStatus.state === 'connected') {
    return { state: 'idle', message: 'Ollama connected. Alphonso is idle.' };
  }

  return { state: 'sleeping', message: 'Mic is off.' };
}

export function companionStateFromVoice(voiceStatus) {
  if (voiceStatus.state === VOICE_STATES.LISTENING) return 'listening';
  if (voiceStatus.state === VOICE_STATES.REQUESTING_PERMISSION) return 'thinking';
  if ([VOICE_STATES.PERMISSION_DENIED, VOICE_STATES.NO_MICROPHONE, VOICE_STATES.UNSUPPORTED, VOICE_STATES.ERROR].includes(voiceStatus.state)) return 'warning';
  return 'idle';
}

export function coachMessageFromVoice(voiceStatus) {
  if (voiceStatus.state === VOICE_STATES.LISTENING) return 'Listening...';
  if (voiceStatus.state === VOICE_STATES.REQUESTING_PERMISSION) return 'Checking microphone permission.';
  if ([VOICE_STATES.PERMISSION_DENIED, VOICE_STATES.NO_MICROPHONE, VOICE_STATES.UNSUPPORTED, VOICE_STATES.ERROR].includes(voiceStatus.state)) return voiceStatus.message;
  return 'Mic is off.';
}

export function nextCoachCorner(current) {
  const index = COACH_CORNERS.indexOf(current);
  if (index < 0) return COACH_CORNERS[0];
  return COACH_CORNERS[(index + 1) % COACH_CORNERS.length];
}
