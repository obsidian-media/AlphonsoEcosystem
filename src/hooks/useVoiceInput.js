import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TRANSCRIPTION_PIPELINE_STATUS,
  VOICE_STATES,
  classifyVoiceError,
  getVoicePrivacyLabel,
  requestAudioStream,
  stopAudioStream,
  supportsMicrophoneCapture
} from '../services/voiceService';

function createInitialVoiceState() {
  if (!supportsMicrophoneCapture()) {
    return {
      state: VOICE_STATES.UNSUPPORTED,
      message: 'This WebView or browser does not support microphone capture.',
      privacyLabel: getVoicePrivacyLabel(VOICE_STATES.UNSUPPORTED),
      transcription: TRANSCRIPTION_PIPELINE_STATUS
    };
  }

  return {
    state: VOICE_STATES.IDLE,
    message: 'Mic is off.',
    privacyLabel: getVoicePrivacyLabel(VOICE_STATES.IDLE),
    transcription: TRANSCRIPTION_PIPELINE_STATUS
  };
}

export function useVoiceInput() {
  const [voiceStatus, setVoiceStatus] = useState(createInitialVoiceState);
  const streamRef = useRef(null);

  const updateState = useCallback((state, message) => {
    setVoiceStatus({
      state,
      message,
      privacyLabel: getVoicePrivacyLabel(state),
      transcription: TRANSCRIPTION_PIPELINE_STATUS
    });
  }, []);

  const stopListening = useCallback(() => {
    stopAudioStream(streamRef.current);
    streamRef.current = null;
    updateState(VOICE_STATES.STOPPED, TRANSCRIPTION_PIPELINE_STATUS.message);
  }, [updateState]);

  const startListening = useCallback(async () => {
    if (streamRef.current) {
      stopListening();
      return;
    }

    updateState(VOICE_STATES.REQUESTING_PERMISSION, 'Requesting microphone permission...');

    try {
      const stream = await requestAudioStream();
      streamRef.current = stream;
      updateState(VOICE_STATES.PERMISSION_GRANTED, TRANSCRIPTION_PIPELINE_STATUS.message);

      window.setTimeout(() => {
        if (streamRef.current === stream) {
          updateState(VOICE_STATES.LISTENING, 'Listening...');
        }
      }, 120);
    } catch (error) {
      const classified = classifyVoiceError(error);
      updateState(classified.state, classified.message);
    }
  }, [stopListening, updateState]);

  const toggleListening = useCallback(() => {
    if (streamRef.current) {
      stopListening();
      return;
    }

    startListening();
  }, [startListening, stopListening]);

  useEffect(() => stopListening, [stopListening]);

  return {
    voiceStatus,
    startListening,
    stopListening,
    toggleListening,
    transcription: TRANSCRIPTION_PIPELINE_STATUS
  };
}
