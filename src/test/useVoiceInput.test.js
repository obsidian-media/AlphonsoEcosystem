import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    available: false,
    engine: null,
    message: 'Microphone works. Speech-to-text engine not connected yet.',
    futureEngines: []
  },
  supportsMicrophoneCapture: vi.fn(() => true),
  supportsSpeechRecognition: vi.fn(() => false),
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
  TRANSCRIPTION_PIPELINE_STATUS
} from '../services/voiceService';

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsMicrophoneCapture.mockReturnValue(true);
    supportsSpeechRecognition.mockReturnValue(false);
    requestAudioStream.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
  });

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

  it('returns liveTranscript as empty string initially', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.liveTranscript).toBe('');
  });

  it('returns toggleListening, startListening, and stopListening functions', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(typeof result.current.toggleListening).toBe('function');
    expect(typeof result.current.startListening).toBe('function');
    expect(typeof result.current.stopListening).toBe('function');
  });

  it('startListening changes state away from idle (audio stream path)', async () => {
    supportsSpeechRecognition.mockReturnValue(false);
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.voiceStatus.state).toBe('idle');

    await act(async () => {
      await result.current.startListening();
    });

    // After acquiring the stream, state should have advanced (at minimum to requesting_permission
    // or permission_granted/listening — anything but idle)
    expect(result.current.voiceStatus.state).not.toBe('idle');
  });

  it('stopListening changes state to stopped', async () => {
    supportsSpeechRecognition.mockReturnValue(false);
    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startListening();
    });

    act(() => {
      result.current.stopListening();
    });

    expect(result.current.voiceStatus.state).toBe('stopped');
  });

  it('transcription.available matches TRANSCRIPTION_PIPELINE_STATUS', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.transcription.available).toBe(TRANSCRIPTION_PIPELINE_STATUS.available);
  });
});
