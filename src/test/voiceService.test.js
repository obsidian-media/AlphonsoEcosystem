import { describe, it, expect } from 'vitest';
import {
  VOICE_STATES,
  TRANSCRIPTION_PIPELINE_STATUS,
  getVoicePrivacyLabel,
  classifyVoiceError,
} from '../services/voiceService';

describe('voiceService', () => {
  describe('VOICE_STATES', () => {
    it('has all expected state keys', () => {
      expect(VOICE_STATES).toMatchObject({
        IDLE: 'idle',
        REQUESTING_PERMISSION: 'requesting_permission',
        PERMISSION_GRANTED: 'permission_granted',
        LISTENING: 'listening',
        STOPPED: 'stopped',
        PERMISSION_DENIED: 'permission_denied',
        NO_MICROPHONE: 'no_microphone',
        UNSUPPORTED: 'unsupported',
        ERROR: 'error',
      });
    });
  });

  describe('TRANSCRIPTION_PIPELINE_STATUS', () => {
    it('available is a boolean', () => {
      expect(typeof TRANSCRIPTION_PIPELINE_STATUS.available).toBe('boolean');
    });

    it('futureEngines is an array', () => {
      expect(Array.isArray(TRANSCRIPTION_PIPELINE_STATUS.futureEngines)).toBe(true);
    });
  });

  describe('getVoicePrivacyLabel', () => {
    it('returns "Listening" for listening state', () => {
      expect(getVoicePrivacyLabel('listening')).toBe('Listening');
    });

    it('returns "Mic Off" for idle state', () => {
      expect(getVoicePrivacyLabel('idle')).toBe('Mic Off');
    });

    it('returns "Mic Blocked" for permission_denied state', () => {
      expect(getVoicePrivacyLabel('permission_denied')).toBe('Mic Blocked');
    });

    it('returns "Error" for error state', () => {
      expect(getVoicePrivacyLabel('error')).toBe('Error');
    });
  });

  describe('classifyVoiceError', () => {
    it('returns permission_denied state for NotAllowedError', () => {
      const result = classifyVoiceError({ name: 'NotAllowedError' });
      expect(result.state).toBe('permission_denied');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('returns no_microphone state for NotFoundError', () => {
      const result = classifyVoiceError({ name: 'NotFoundError' });
      expect(result.state).toBe('no_microphone');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('returns custom state and message when error has voiceState property', () => {
      const result = classifyVoiceError({ voiceState: 'error', message: 'custom' });
      expect(result.state).toBe('error');
      expect(result.message).toBe('custom');
    });
  });
});
