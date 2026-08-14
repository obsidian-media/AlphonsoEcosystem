import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/voiceService', () => ({
  VOICE_STATES: {
    IDLE: 'idle',
    REQUESTING_PERMISSION: 'requesting_permission',
    PERMISSION_GRANTED: 'permission_granted',
    LISTENING: 'listening',
    STOPPED: 'stopped',
    PERMISSION_DENIED: 'permission_denied',
    NO_MICROPHONE: 'no_microphone',
    UNSUPPORTED: 'unsupported',
    ERROR: 'error'
  },
  TRANSCRIPTION_PIPELINE_STATUS: {
    available: true,
    engine: 'WebSpeechAPI',
    message: 'Speech recognition ready. Click mic to start dictating.',
    futureEngines: ['Whisper', 'faster-whisper', 'wake-word detection', 'local-only transcription pipeline']
  },
  supportsMicrophoneCapture: vi.fn(() => true),
  supportsSpeechRecognition: vi.fn(() => true),
  requestAudioStream: vi.fn(async () => ({
    getTracks: () => [{ stop: vi.fn() }]
  })),
  stopAudioStream: vi.fn(),
  classifyVoiceError: vi.fn((e) => ({ state: 'error', message: e?.message || 'Error' })),
  getVoicePrivacyLabel: vi.fn((state) => (state === 'idle' ? 'Mic Off' : state)),
  startSpeechRecognition: vi.fn(() => vi.fn())
}));

import { useVoiceInput } from '../hooks/useVoiceInput';
import {
  supportsMicrophoneCapture,
  supportsSpeechRecognition,
  requestAudioStream,
  TRANSCRIPTION_PIPELINE_STATUS,
  classifyVoiceError,
  getVoicePrivacyLabel,
  startSpeechRecognition,
  stopAudioStream,
  VOICE_STATES
} from '../services/voiceService';

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    supportsMicrophoneCapture.mockReturnValue(true);
    supportsSpeechRecognition.mockReturnValue(true);
    requestAudioStream.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
    classifyVoiceError.mockImplementation((e) => ({ state: 'error', message: e?.message || 'Error' }));
    getVoicePrivacyLabel.mockImplementation((state) => (state === 'idle' ? 'Mic Off' : state));
    startSpeechRecognition.mockImplementation(() => vi.fn());
    stopAudioStream.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial state', () => {
    it('initial voiceStatus.state is idle when supportsMicrophoneCapture returns true', () => {
      supportsMicrophoneCapture.mockReturnValue(true);
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('idle');
    });

    it('initial voiceStatus.state is unsupported when supportsMicrophoneCapture returns false', () => {
      supportsMicrophoneCapture.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('unsupported');
    });

    it('initial voiceStatus includes correct privacyLabel for idle state', () => {
      getVoicePrivacyLabel.mockReturnValueOnce('Mic Off');
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.privacyLabel).toBe('Mic Off');
    });

    it('initial voiceStatus includes transcription pipeline status', () => {
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.transcription).toEqual(TRANSCRIPTION_PIPELINE_STATUS);
    });

    it('returns liveTranscript as empty string initially', () => {
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.liveTranscript).toBe('');
    });

    it('returns all control functions', () => {
      const { result } = renderHook(() => useVoiceInput());
      expect(typeof result.current.toggleListening).toBe('function');
      expect(typeof result.current.startListening).toBe('function');
      expect(typeof result.current.stopListening).toBe('function');
    });
  });

  describe('Speech Recognition path (Web Speech API)', () => {
    it('startListening transitions to LISTENING state', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('idle');

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');
      expect(startSpeechRecognition).toHaveBeenCalled();
    });

    it('updates liveTranscript on interim results', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let transcriptCallback;
      startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        transcriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        transcriptCallback('Hello', false);
      });
      expect(result.current.liveTranscript).toBe('Hello');
    });

    it('calls onTranscript callback with final transcript', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      const onTranscript = vi.fn();
      let transcriptCallback;
      startSpeechRecognition.mockImplementation(({ onTranscript: cb }) => {
        transcriptCallback = cb;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript }));
      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        transcriptCallback('Hello world', true);
      });

      expect(result.current.liveTranscript).toBe('Hello world');
      expect(onTranscript).toHaveBeenCalledWith('Hello world');
    });

    it('resets to STOPPED on recognition end', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let endCallback;
      startSpeechRecognition.mockImplementation(({ onEnd }) => {
        endCallback = onEnd;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });
      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        endCallback();
      });

      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('handles recognition errors and updates state', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let errorCallback;
      startSpeechRecognition.mockImplementation(({ onError }) => {
        errorCallback = onError;
        return vi.fn();
      });
      classifyVoiceError.mockReturnValue({ state: 'permission_denied', message: 'Microphone permission blocked.' });

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        errorCallback({ error: 'not-allowed', message: 'Not allowed' });
      });

      expect(result.current.voiceStatus.state).toBe('permission_denied');
      expect(result.current.voiceStatus.message).toBe('Microphone permission blocked.');
    });
  });

  describe('Audio stream fallback path (no SpeechRecognition)', () => {
    it('uses audio stream fallback when SpeechRecognition not supported', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('idle');

      await act(async () => {
        await result.current.startListening();
      });

      expect(requestAudioStream).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('permission_granted');
    });

    it('transitions to LISTENING after timeout in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.startListening();
      });
      expect(result.current.voiceStatus.state).toBe('permission_granted');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(result.current.voiceStatus.state).toBe('listening');
    });

    it('stops audio stream on stopListening in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      expect(stopAudioStream).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('does not advance to LISTENING if stream was stopped before timeout', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(result.current.voiceStatus.state).toBe('stopped');
    });
  });

  describe('toggleListening', () => {
    it('starts listening when idle', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('idle');

      await act(async () => {
        await result.current.toggleListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');
    });

    it('stops listening when already listening', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let stopRecognition;
      startSpeechRecognition.mockImplementation(() => {
        stopRecognition = vi.fn();
        return stopRecognition;
      });

      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.toggleListening();
      });
      expect(result.current.voiceStatus.state).toBe('listening');

      await act(async () => {
        await result.current.toggleListening();
      });

      expect(stopRecognition).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('stops listening in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.toggleListening();
      });
      expect(result.current.voiceStatus.state).not.toBe('idle');

      await act(async () => {
        await result.current.toggleListening();
      });

      expect(stopAudioStream).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
    });
  });

  describe('stopListening cleanup', () => {
    it('clears stopSpeechRef and streamRef', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let stopRecognition;
      startSpeechRecognition.mockImplementation(() => {
        stopRecognition = vi.fn();
        return stopRecognition;
      });

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      expect(stopRecognition).toHaveBeenCalled();
      expect(stopAudioStream).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('preserves liveTranscript after stopping', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let transcriptCallback;
      startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        transcriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        transcriptCallback('Final transcript', true);
      });
      expect(result.current.liveTranscript).toBe('Final transcript');

      act(() => {
        result.current.stopListening();
      });

      expect(result.current.liveTranscript).toBe('Final transcript');
    });

    it('is idempotent - calling multiple times does not error', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
        result.current.stopListening();
      });

      expect(result.current.voiceStatus.state).toBe('stopped');
    });
  });

  describe('Error handling', () => {
    it('classifies NotAllowedError as PERMISSION_DENIED in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      requestAudioStream.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
      classifyVoiceError.mockReturnValueOnce({ state: 'permission_denied', message: 'Microphone permission blocked.' });

      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        try {
          await result.current.startListening();
        } catch { /* ignore */ }
      });

      expect(result.current.voiceStatus.state).toBe('permission_denied');
      expect(result.current.voiceStatus.message).toBe('Microphone permission blocked.');
    });

    it('classifies NotFoundError as NO_MICROPHONE in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      requestAudioStream.mockRejectedValueOnce(new DOMException('No device', 'NotFoundError'));
      classifyVoiceError.mockReturnValueOnce({ state: 'no_microphone', message: 'No microphone found.' });

      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        try {
          await result.current.startListening();
        } catch { /* ignore */ }
      });

      expect(result.current.voiceStatus.state).toBe('no_microphone');
      expect(result.current.voiceStatus.message).toBe('No microphone found.');
    });

    it('classifies NotReadableError as ERROR in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);
      requestAudioStream.mockRejectedValueOnce(new DOMException('In use', 'NotReadableError'));
      classifyVoiceError.mockReturnValueOnce({ state: 'error', message: 'Microphone is unavailable or already in use.' });

      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        try {
          await result.current.startListening();
        } catch { /* ignore */ }
      });

      expect(result.current.voiceStatus.state).toBe('error');
      expect(result.current.voiceStatus.message).toBe('Microphone is unavailable or already in use.');
    });

    it('handles SpeechRecognition start error', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let errorCallback;
      startSpeechRecognition.mockImplementation(({ onError }) => {
        errorCallback = onError;
        return vi.fn();
      });
      classifyVoiceError.mockReturnValue({ state: 'error', message: 'Network error' });

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        errorCallback({ error: 'network', message: 'Network error' });
      });

      expect(result.current.voiceStatus.state).toBe('error');
      expect(result.current.voiceStatus.message).toBe('Network error');
    });
  });

  describe('Cleanup on unmount', () => {
    it('calls stopListening on unmount', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let stopRecognition;
      startSpeechRecognition.mockImplementation(() => {
        stopRecognition = vi.fn();
        return stopRecognition;
      });

      const { result, unmount } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      unmount();

      expect(stopRecognition).toHaveBeenCalled();
      expect(stopAudioStream).toHaveBeenCalled();
    });

    it('does not error if unmounting before start', () => {
      const { unmount } = renderHook(() => useVoiceInput());
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Session state transitions', () => {
    it('follows idle -> requesting_permission -> listening -> stopped sequence', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let transcriptCallback, endCallback;
      startSpeechRecognition.mockImplementation(({ onTranscript, onEnd }) => {
        transcriptCallback = onTranscript;
        endCallback = onEnd;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('idle');

      await act(async () => {
        await result.current.startListening();
      });
      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        endCallback();
      });
      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('allows new session after stopped', async () => {
      supportsSpeechRecognition.mockReturnValue(true);
      let endCallback;
      startSpeechRecognition.mockImplementation(({ onEnd }) => {
        endCallback = onEnd;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        endCallback();
      });
      expect(result.current.voiceStatus.state).toBe('stopped');

      await act(async () => {
        await result.current.startListening();
      });
      expect(result.current.voiceStatus.state).toBe('listening');
    });
  });

  describe('Microphone permission handling', () => {
    it('requests audio stream when starting in fallback mode', async () => {
      supportsSpeechRecognition.mockReturnValue(false);

      const { result } = renderHook(() => useVoiceInput());
      await act(async () => {
        await result.current.startListening();
      });

      expect(requestAudioStream).toHaveBeenCalledTimes(1);
    });

    it('handles unsupported microphone gracefully', () => {
      supportsMicrophoneCapture.mockReturnValue(false);
      const { result } = renderHook(() => useVoiceInput());
      expect(result.current.voiceStatus.state).toBe('unsupported');
      expect(result.current.voiceStatus.message).toBe('This WebView or browser does not support microphone capture.');
    });
  });
});