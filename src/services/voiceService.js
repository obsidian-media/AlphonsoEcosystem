export const VOICE_STATES = {
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  PERMISSION_GRANTED: 'permission_granted',
  LISTENING: 'listening',
  STOPPED: 'stopped',
  PERMISSION_DENIED: 'permission_denied',
  NO_MICROPHONE: 'no_microphone',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error'
};

export const TRANSCRIPTION_PIPELINE_STATUS = {
  available: false,
  engine: null,
  message: 'Microphone works. Speech-to-text engine not connected yet.',
  futureEngines: [
    'Whisper',
    'faster-whisper',
    'wake-word detection',
    'local-only transcription pipeline'
  ]
};

export function supportsMicrophoneCapture() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function requestAudioStream() {
  if (!supportsMicrophoneCapture()) {
    const error = new Error('This WebView or browser does not support microphone capture.');
    error.voiceState = VOICE_STATES.UNSUPPORTED;
    throw error;
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function stopAudioStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export function classifyVoiceError(error) {
  if (error?.voiceState) {
    return {
      state: error.voiceState,
      message: error.message
    };
  }

  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return {
      state: VOICE_STATES.PERMISSION_DENIED,
      message: 'Microphone permission blocked.'
    };
  }

  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return {
      state: VOICE_STATES.NO_MICROPHONE,
      message: 'No microphone found.'
    };
  }

  if (error?.name === 'NotReadableError') {
    return {
      state: VOICE_STATES.ERROR,
      message: 'Microphone is unavailable or already in use.'
    };
  }

  return {
    state: VOICE_STATES.ERROR,
    message: error?.message || 'Microphone error.'
  };
}

export function getVoicePrivacyLabel(state) {
  switch (state) {
    case VOICE_STATES.REQUESTING_PERMISSION:
      return 'Requesting Mic';
    case VOICE_STATES.PERMISSION_GRANTED:
      return 'Mic Permission Granted';
    case VOICE_STATES.LISTENING:
      return 'Listening';
    case VOICE_STATES.PERMISSION_DENIED:
      return 'Mic Blocked';
    case VOICE_STATES.NO_MICROPHONE:
      return 'No Microphone';
    case VOICE_STATES.UNSUPPORTED:
      return 'Unsupported';
    case VOICE_STATES.ERROR:
      return 'Error';
    case VOICE_STATES.STOPPED:
    case VOICE_STATES.IDLE:
    default:
      return 'Mic Off';
  }
}
