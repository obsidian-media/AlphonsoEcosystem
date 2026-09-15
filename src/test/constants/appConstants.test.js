import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  themeClassFromSettings,
  getCompanionState,
  companionStateFromVoice,
  coachMessageFromVoice,
  nextCoachCorner,
  COACH_CORNERS,
  INITIAL_CONVERSATION_ID,
  COACH_LAYOUT_KEY,
  VERIFICATION_LOG_CAP,
  AUDIT_LOG_FETCH_LIMIT,
  SNAPSHOT_HISTORY_CAP,
  COPY_RESET_MS,
  WORKSPACE_PROOF_TIMEOUT_MS,
  SYMBOL_INDEX_FILE_LIMIT,
  SCREEN_OBSERVER_INTERVAL_MS,
  MEMORY_EXPIRY_MS,
  COACH_PAUSE_MS,
} from '../../constants/appConstants';

describe('appConstants', () => {
  describe('exported constants', () => {
    it('INITIAL_CONVERSATION_ID is default-session', () => {
      expect(INITIAL_CONVERSATION_ID).toBe('default-session');
    });

    it('COACH_LAYOUT_KEY is alphonso_coach_layout_v1', () => {
      expect(COACH_LAYOUT_KEY).toBe('alphonso_coach_layout_v1');
    });

    it('COACH_CORNERS has 4 entries', () => {
      expect(COACH_CORNERS).toEqual(['bottom-right', 'bottom-left', 'top-right', 'top-left']);
    });

    it('VERIFICATION_LOG_CAP is 250', () => {
      expect(VERIFICATION_LOG_CAP).toBe(250);
    });

    it('AUDIT_LOG_FETCH_LIMIT is 200', () => {
      expect(AUDIT_LOG_FETCH_LIMIT).toBe(200);
    });

    it('SNAPSHOT_HISTORY_CAP is 40', () => {
      expect(SNAPSHOT_HISTORY_CAP).toBe(40);
    });

    it('COPY_RESET_MS is 1600', () => {
      expect(COPY_RESET_MS).toBe(1600);
    });

    it('WORKSPACE_PROOF_TIMEOUT_MS is 1200', () => {
      expect(WORKSPACE_PROOF_TIMEOUT_MS).toBe(1200);
    });

    it('SYMBOL_INDEX_FILE_LIMIT is 500', () => {
      expect(SYMBOL_INDEX_FILE_LIMIT).toBe(500);
    });

    it('SCREEN_OBSERVER_INTERVAL_MS is 5000', () => {
      expect(SCREEN_OBSERVER_INTERVAL_MS).toBe(5000);
    });

    it('MEMORY_EXPIRY_MS is 7 days in milliseconds', () => {
      expect(MEMORY_EXPIRY_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('COACH_PAUSE_MS is 60000', () => {
      expect(COACH_PAUSE_MS).toBe(60000);
    });
  });

  describe('themeClassFromSettings', () => {
    it('returns theme-orchestrator-gold for orchestrator_gold', () => {
      expect(themeClassFromSettings({ environmentTheme: 'orchestrator_gold' })).toBe('theme-orchestrator-gold');
    });

    it('returns theme-neon-studio for neon_studio', () => {
      expect(themeClassFromSettings({ environmentTheme: 'neon_studio' })).toBe('theme-neon-studio');
    });

    it('returns theme-minimal-runtime for minimal_runtime', () => {
      expect(themeClassFromSettings({ environmentTheme: 'minimal_runtime' })).toBe('theme-minimal-runtime');
    });

    it('returns theme-deep-space for unknown theme', () => {
      expect(themeClassFromSettings({ environmentTheme: 'something_else' })).toBe('theme-deep-space');
    });

    it('returns theme-deep-space when environmentTheme is missing', () => {
      expect(themeClassFromSettings({})).toBe('theme-deep-space');
    });

    it('returns theme-deep-space for undefined settings', () => {
      expect(themeClassFromSettings({ environmentTheme: undefined })).toBe('theme-deep-space');
    });
  });

  describe('getCompanionState', () => {
    const base = {
      ollamaStatus: { state: 'connected' },
      voiceStatus: { state: 'idle', message: '' },
      isGeneratingResponse: false,
      lastTaskCompletedAt: null,
      selectedModelMissing: false,
      privacyModeActive: false,
      approvalModeActive: false,
      approvalRequiredNotice: false,
    };

    it('returns approval_required when approval mode active and notice present', () => {
      const result = getCompanionState({ ...base, approvalModeActive: true, approvalRequiredNotice: true });
      expect(result.state).toBe('approval_required');
      expect(result.message).toBe('Approval required before action.');
    });

    it('returns listening when voice is listening', () => {
      const result = getCompanionState({ ...base, voiceStatus: { state: 'listening', message: '' } });
      expect(result.state).toBe('listening');
      expect(result.message).toBe('Listening...');
    });

    it('returns warning for permission_denied voice state', () => {
      const result = getCompanionState({ ...base, voiceStatus: { state: 'permission_denied', message: 'Mic blocked' } });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('Mic blocked');
    });

    it('returns warning for no_microphone voice state', () => {
      const result = getCompanionState({ ...base, voiceStatus: { state: 'no_microphone', message: 'No mic' } });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('No mic');
    });

    it('returns warning for unsupported voice state', () => {
      const result = getCompanionState({ ...base, voiceStatus: { state: 'unsupported', message: 'Not supported' } });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('Not supported');
    });

    it('returns warning for error voice state', () => {
      const result = getCompanionState({ ...base, voiceStatus: { state: 'error', message: 'Mic error' } });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('Mic error');
    });

    it('returns thinking for requesting_permission voice state', () => {
      const result = getCompanionState({ ...base, voiceStatus: { state: 'requesting_permission', message: '' } });
      expect(result.state).toBe('thinking');
      expect(result.message).toBe('Checking microphone permission.');
    });

    it('returns warning when selected model is missing', () => {
      const result = getCompanionState({ ...base, selectedModelMissing: true });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('Selected model is missing.');
    });

    it('returns warning when ollama is not_running', () => {
      const result = getCompanionState({ ...base, ollamaStatus: { state: 'not_running' } });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('Ollama is disconnected.');
    });

    it('returns warning when ollama is cors', () => {
      const result = getCompanionState({ ...base, ollamaStatus: { state: 'cors' } });
      expect(result.state).toBe('warning');
    });

    it('returns warning when ollama is timeout', () => {
      const result = getCompanionState({ ...base, ollamaStatus: { state: 'timeout' } });
      expect(result.state).toBe('warning');
    });

    it('returns warning when ollama is disconnected', () => {
      const result = getCompanionState({ ...base, ollamaStatus: { state: 'disconnected' } });
      expect(result.state).toBe('warning');
    });

    it('returns thinking when ollama is connecting', () => {
      const result = getCompanionState({ ...base, ollamaStatus: { state: 'connecting' } });
      expect(result.state).toBe('thinking');
      expect(result.message).toBe('Checking Ollama.');
    });

    it('returns thinking when generating response', () => {
      const result = getCompanionState({ ...base, isGeneratingResponse: true });
      expect(result.state).toBe('thinking');
      expect(result.message).toBe('Thinking...');
    });

    it('returns task_complete when task completed within 5s', () => {
      const result = getCompanionState({ ...base, lastTaskCompletedAt: Date.now() - 1000 });
      expect(result.state).toBe('task_complete');
      expect(result.message).toBe('Task complete.');
    });

    it('does not return task_complete when task completed >5s ago', () => {
      const result = getCompanionState({ ...base, lastTaskCompletedAt: Date.now() - 10000 });
      expect(result.state).not.toBe('task_complete');
    });

    it('returns privacy_shield_active when privacy mode active', () => {
      const result = getCompanionState({ ...base, privacyModeActive: true });
      expect(result.state).toBe('privacy_shield_active');
      expect(result.message).toBe('Privacy shield active.');
    });

    it('returns idle when ollama is connected and no other conditions', () => {
      const result = getCompanionState({ ...base });
      expect(result.state).toBe('idle');
      expect(result.message).toBe('Ollama connected. Alphonso is idle.');
    });

    it('returns sleeping as default fallback', () => {
      const result = getCompanionState({
        ...base,
        ollamaStatus: { state: 'idle' },
        voiceStatus: { state: 'idle', message: '' },
      });
      expect(result.state).toBe('sleeping');
      expect(result.message).toBe('Mic is off.');
    });

    it('approval_required takes priority over listening', () => {
      const result = getCompanionState({
        ...base,
        approvalModeActive: true,
        approvalRequiredNotice: true,
        voiceStatus: { state: 'listening', message: '' },
      });
      expect(result.state).toBe('approval_required');
    });

    it('listening takes priority over voice errors', () => {
      const result = getCompanionState({
        ...base,
        voiceStatus: { state: 'listening', message: '' },
      });
      expect(result.state).toBe('listening');
    });

    it('voice errors take priority over model missing', () => {
      const result = getCompanionState({
        ...base,
        selectedModelMissing: true,
        voiceStatus: { state: 'permission_denied', message: 'Mic blocked' },
      });
      expect(result.state).toBe('warning');
      expect(result.message).toBe('Mic blocked');
    });
  });

  describe('companionStateFromVoice', () => {
    it('returns listening for listening state', () => {
      expect(companionStateFromVoice({ state: 'listening' })).toBe('listening');
    });

    it('returns thinking for requesting_permission', () => {
      expect(companionStateFromVoice({ state: 'requesting_permission' })).toBe('thinking');
    });

    it('returns warning for permission_denied', () => {
      expect(companionStateFromVoice({ state: 'permission_denied' })).toBe('warning');
    });

    it('returns warning for no_microphone', () => {
      expect(companionStateFromVoice({ state: 'no_microphone' })).toBe('warning');
    });

    it('returns warning for unsupported', () => {
      expect(companionStateFromVoice({ state: 'unsupported' })).toBe('warning');
    });

    it('returns warning for error', () => {
      expect(companionStateFromVoice({ state: 'error' })).toBe('warning');
    });

    it('returns idle for idle state', () => {
      expect(companionStateFromVoice({ state: 'idle' })).toBe('idle');
    });

    it('returns idle for stopped state', () => {
      expect(companionStateFromVoice({ state: 'stopped' })).toBe('idle');
    });
  });

  describe('coachMessageFromVoice', () => {
    it('returns Listening... for listening state', () => {
      expect(coachMessageFromVoice({ state: 'listening' })).toBe('Listening...');
    });

    it('returns permission message for requesting_permission', () => {
      expect(coachMessageFromVoice({ state: 'requesting_permission' })).toBe('Checking microphone permission.');
    });

    it('returns voice message for permission_denied', () => {
      expect(coachMessageFromVoice({ state: 'permission_denied', message: 'Access denied' })).toBe('Access denied');
    });

    it('returns voice message for no_microphone', () => {
      expect(coachMessageFromVoice({ state: 'no_microphone', message: 'No mic found' })).toBe('No mic found');
    });

    it('returns voice message for unsupported', () => {
      expect(coachMessageFromVoice({ state: 'unsupported', message: 'Browser unsupported' })).toBe('Browser unsupported');
    });

    it('returns voice message for error', () => {
      expect(coachMessageFromVoice({ state: 'error', message: 'Mic error' })).toBe('Mic error');
    });

    it('returns Mic is off. for idle', () => {
      expect(coachMessageFromVoice({ state: 'idle' })).toBe('Mic is off.');
    });

    it('returns Mic is off. for stopped', () => {
      expect(coachMessageFromVoice({ state: 'stopped' })).toBe('Mic is off.');
    });
  });

  describe('nextCoachCorner', () => {
    it('returns bottom-left after bottom-right', () => {
      expect(nextCoachCorner('bottom-right')).toBe('bottom-left');
    });

    it('returns top-right after bottom-left', () => {
      expect(nextCoachCorner('bottom-left')).toBe('top-right');
    });

    it('returns top-left after top-right', () => {
      expect(nextCoachCorner('top-right')).toBe('top-left');
    });

    it('wraps to bottom-right after top-left', () => {
      expect(nextCoachCorner('top-left')).toBe('bottom-right');
    });

    it('returns bottom-right for unknown corner', () => {
      expect(nextCoachCorner('center')).toBe('bottom-right');
    });

    it('returns bottom-right for empty string', () => {
      expect(nextCoachCorner('')).toBe('bottom-right');
    });
  });
});
