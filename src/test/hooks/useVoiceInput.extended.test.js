import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  supportsMicrophoneCapture: vi.fn().mockReturnValue(true),
  requestAudioStream: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
  stopAudioStream: vi.fn(),
  supportsSpeechRecognition: vi.fn().mockReturnValue(true),
  startSpeechRecognition: vi.fn().mockReturnValue(vi.fn()),
  classifyVoiceError: vi.fn((error) => ({ state: 'error', message: error?.message || 'Error' })),
  getVoicePrivacyLabel: vi.fn((state) => state),
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
    futureEngines: []
  }
}));

vi.mock('../../services/voiceService', () => ({
  supportsMicrophoneCapture: mocks.supportsMicrophoneCapture,
  requestAudioStream: mocks.requestAudioStream,
  stopAudioStream: mocks.stopAudioStream,
  supportsSpeechRecognition: mocks.supportsSpeechRecognition,
  startSpeechRecognition: mocks.startSpeechRecognition,
  classifyVoiceError: mocks.classifyVoiceError,
  getVoicePrivacyLabel: mocks.getVoicePrivacyLabel,
  VOICE_STATES: mocks.VOICE_STATES,
  TRANSCRIPTION_PIPELINE_STATUS: mocks.TRANSCRIPTION_PIPELINE_STATUS
}));

import { useVoiceInput } from '../../hooks/useVoiceInput';

describe('useVoiceInput (extended)', () => {
  let onTranscriptMock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    onTranscriptMock = vi.fn();

    mocks.supportsMicrophoneCapture.mockReturnValue(true);
    mocks.supportsSpeechRecognition.mockReturnValue(true);
    mocks.requestAudioStream.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
    mocks.startSpeechRecognition.mockReturnValue(vi.fn());
    mocks.classifyVoiceError.mockImplementation((error) => ({
      state: 'error',
      message: error?.message || 'Error'
    }));
    mocks.getVoicePrivacyLabel.mockImplementation((state) => state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial state', () => {
    it('initializes with IDLE state when microphone is supported', () => {
      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      expect(result.current.voiceStatus.state).toBe('idle');
      expect(result.current.voiceStatus.message).toBe('Mic is off.');
      expect(result.current.liveTranscript).toBe('');
    });

    it('initializes with UNSUPPORTED state when microphone capture is not supported', () => {
      mocks.supportsMicrophoneCapture.mockReturnValue(false);

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      expect(result.current.voiceStatus.state).toBe('unsupported');
      expect(result.current.voiceStatus.message).toContain('does not support microphone');
    });
  });

  describe('SpeechRecognition lifecycle', () => {
    it('starts listening and transitions to LISTENING state immediately when SpeechRecognition is supported', async () => {
      let onTranscriptCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        onTranscriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      // State transitions: REQUESTING_PERMISSION -> LISTENING (synchronously)
      expect(result.current.voiceStatus.state).toBe('listening');
    });

    it('stops listening and cleans up when stopListening is called', async () => {
      const stopRecognition = vi.fn();
      mocks.startSpeechRecognition.mockReturnValue(stopRecognition);

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        result.current.stopListening();
      });

      expect(stopRecognition).toHaveBeenCalled();
      expect(mocks.stopAudioStream).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('toggles listening on and off with toggleListening', async () => {
      const stopRecognition = vi.fn();
      mocks.startSpeechRecognition.mockReturnValue(stopRecognition);

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.toggleListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        result.current.toggleListening();
      });

      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('stops existing session when startListening called again (toggle behavior)', async () => {
      const stopRecognition1 = vi.fn();
      mocks.startSpeechRecognition.mockReturnValue(stopRecognition1);

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      // First call to startListening - starts listening
      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      // Second call should stop existing session (toggle behavior) and NOT start new one
      await act(async () => {
        await result.current.startListening();
      });

      expect(stopRecognition1).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
      // startSpeechRecognition should only be called once (first call)
      expect(mocks.startSpeechRecognition).toHaveBeenCalledTimes(1);
    });
  });

  describe('SpeechRecognition configuration', () => {
    it('configures SpeechRecognition with required callbacks', () => {
      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      // Get the config from the mock call arguments
      const recognitionConfig = mocks.startSpeechRecognition.mock.calls[0]?.[0];
      
      expect(mocks.startSpeechRecognition).toHaveBeenCalledTimes(1);
      expect(recognitionConfig).toBeDefined();
      expect(recognitionConfig.onTranscript).toBeDefined();
      expect(recognitionConfig.onEnd).toBeDefined();
      expect(recognitionConfig.onError).toBeDefined();
    });
  });

  describe('Barge-in cancellation during TTS', () => {
    it('stops current listening session when toggleListening called while listening', async () => {
      const stopRecognition = vi.fn();
      mocks.startSpeechRecognition.mockReturnValue(stopRecognition);

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        result.current.toggleListening();
      });

      expect(stopRecognition).toHaveBeenCalled();
      expect(mocks.stopAudioStream).toHaveBeenCalled();
      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('starts new session when toggleListening called while idle', async () => {
      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.toggleListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');
    });
  });

  describe('SpeechRecognition events / transcript handling', () => {
    it('updates liveTranscript on interim results', async () => {
      let onTranscriptCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        onTranscriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onTranscriptCallback('hello', false);
      });

      expect(result.current.liveTranscript).toBe('hello');
    });

    it('calls onTranscript callback with final result', async () => {
      let onTranscriptCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        onTranscriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onTranscriptCallback('hello world', true);
      });

      expect(onTranscriptMock).toHaveBeenCalledWith('hello world');
      expect(result.current.liveTranscript).toBe('hello world');
    });

    it('handles recognition error and transitions to error state', async () => {
      let onErrorCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onError }) => {
        onErrorCallback = onError;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onErrorCallback({ error: 'no-speech', message: 'No speech detected' });
      });

      expect(result.current.voiceStatus.state).toBe('error');
    });
  });

  describe('STT partial/final result handling', () => {
    it('accumulates partial transcripts in liveTranscript', async () => {
      let onTranscriptCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        onTranscriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onTranscriptCallback('hel', false);
      });
      expect(result.current.liveTranscript).toBe('hel');

      act(() => {
        onTranscriptCallback('hello', false);
      });
      expect(result.current.liveTranscript).toBe('hello');

      act(() => {
        onTranscriptCallback('hello world', true);
      });
      expect(result.current.liveTranscript).toBe('hello world');
      expect(onTranscriptMock).toHaveBeenCalledWith('hello world');
    });

    it('keeps final transcript in liveTranscript for ChatView to use', async () => {
      let onTranscriptCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onTranscript }) => {
        onTranscriptCallback = onTranscript;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onTranscriptCallback('final transcript', true);
      });

      expect(result.current.liveTranscript).toBe('final transcript');
    });
  });

  describe('Session state machine', () => {
    it('starts from idle and goes to listening', async () => {
      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      expect(result.current.voiceStatus.state).toBe('idle');

      act(() => {
        result.current.startListening();
      });

      // Synchronously transitions to listening
      expect(result.current.voiceStatus.state).toBe('listening');
    });

    it('transitions: listening -> stopped on stopListening', async () => {
      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        result.current.stopListening();
      });

      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('transitions: listening -> stopped on recognition end', async () => {
      let onEndCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onEnd }) => {
        onEndCallback = onEnd;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      act(() => {
        onEndCallback();
      });

      expect(result.current.voiceStatus.state).toBe('stopped');
    });

    it('transitions to error state on recognition error', async () => {
      let onErrorCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onError }) => {
        onErrorCallback = onError;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onErrorCallback({ error: 'audio-capture', message: 'Audio capture failed' });
      });

      expect(result.current.voiceStatus.state).toBe('error');
    });
  });

  describe('Error recovery paths', () => {
    it('handles permission denied error and transitions to permission_denied state', async () => {
      let onErrorCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onError }) => {
        onErrorCallback = onError;
        return vi.fn();
      });

      mocks.classifyVoiceError.mockImplementation((error) => {
        if (error?.name === 'NotAllowedError') {
          return { state: 'permission_denied', message: 'Microphone permission blocked.' };
        }
        return { state: 'error', message: error?.message || 'Error' };
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onErrorCallback({ name: 'NotAllowedError', message: 'Permission denied' });
      });

      expect(result.current.voiceStatus.state).toBe('permission_denied');
      expect(result.current.voiceStatus.message).toBe('Microphone permission blocked.');
    });

    it('handles no microphone found error', async () => {
      mocks.supportsSpeechRecognition.mockReturnValue(false);
      mocks.requestAudioStream.mockRejectedValueOnce(
        Object.assign(new Error('No microphone'), { name: 'NotFoundError' })
      );

      mocks.classifyVoiceError.mockImplementation((error) => {
        if (error.name === 'NotFoundError') {
          return { state: 'no_microphone', message: 'No microphone found.' };
        }
        return { state: 'error', message: error.message };
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.voiceStatus.state).toBe('no_microphone');
    });

    it('recovers and starts new session after error', async () => {
      let onErrorCallback;
      mocks.startSpeechRecognition.mockImplementation(({ onError }) => {
        onErrorCallback = onError;
        return vi.fn();
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      act(() => {
        onErrorCallback({ error: 'no-speech', message: 'No speech detected' });
      });

      expect(result.current.voiceStatus.state).toBe('error');

      act(() => {
        result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');
    });
  });

  describe('Cleanup on unmount', () => {
    it('stops listening on unmount', async () => {
      const { result, unmount } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      expect(result.current.voiceStatus.state).toBe('listening');

      unmount();

      expect(mocks.stopAudioStream).toHaveBeenCalled();
    });

    it('cleans up SpeechRecognition stop function on unmount', async () => {
      const stopRecognition = vi.fn();
      mocks.startSpeechRecognition.mockReturnValue(stopRecognition);

      const { result, unmount } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      unmount();

      expect(stopRecognition).toHaveBeenCalled();
    });
  });

  describe('Fallback: audio stream only (no SpeechRecognition)', () => {
    it('uses audio stream fallback when SpeechRecognition not supported', async () => {
      mocks.supportsSpeechRecognition.mockReturnValue(false);
      mocks.requestAudioStream.mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }]
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      await act(async () => {
        await result.current.startListening();
      });

      expect(mocks.requestAudioStream).toHaveBeenCalled();
      // First state is PERMISSION_GRANTED
      expect(result.current.voiceStatus.state).toBe('permission_granted');

      // Advance timers by 150ms to trigger the setTimeout
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      // Should transition to LISTENING after timeout
      expect(result.current.voiceStatus.state).toBe('listening');
    });

    it('handles audio stream error in fallback mode', async () => {
      mocks.supportsSpeechRecognition.mockReturnValue(false);
      mocks.requestAudioStream.mockRejectedValueOnce(
        Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
      );

      mocks.classifyVoiceError.mockImplementation((error) => {
        if (error.name === 'NotAllowedError') {
          return { state: 'permission_denied', message: 'Microphone permission blocked.' };
        }
        return { state: 'error', message: error.message };
      });

      const { result } = renderHook(() => useVoiceInput({ onTranscript: onTranscriptMock }));

      act(() => {
        result.current.startListening();
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.voiceStatus.state).toBe('permission_denied');
    });
  });
});