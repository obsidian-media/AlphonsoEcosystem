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

export type VoiceState = string;

interface SpeechRecognitionResult {
  [index: number]: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResultEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
}

interface WindowWithSpeechRecognition {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export const TRANSCRIPTION_PIPELINE_STATUS = (() => {
  const win = window as unknown as WindowWithSpeechRecognition;
  const hasSpeechRecognition = typeof window !== 'undefined' && Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  return {
    available: hasSpeechRecognition,
    engine: hasSpeechRecognition ? 'WebSpeechAPI' : null,
    message: hasSpeechRecognition
      ? 'Speech recognition ready. Click mic to start dictating.'
      : 'Microphone works. Speech-to-text engine not connected yet.',
    futureEngines: ['Whisper', 'faster-whisper', 'wake-word detection', 'local-only transcription pipeline'],
  };
})();

export function supportsMicrophoneCapture(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function requestAudioStream(): Promise<MediaStream> {
  if (!supportsMicrophoneCapture()) {
    const error = new Error('This WebView or browser does not support microphone capture.') as Error & { voiceState: VoiceState };
    error.voiceState = VOICE_STATES.UNSUPPORTED;
    throw error;
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function stopAudioStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export interface VoiceErrorClassification {
  state: VoiceState;
  message: string;
}

export function classifyVoiceError(error: (Error & { voiceState?: VoiceState; name?: string }) | null): VoiceErrorClassification {
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

export function getVoicePrivacyLabel(state: VoiceState): string {
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

const SpeechRecognitionClass = (typeof window !== 'undefined')
  ? ((window as unknown as WindowWithSpeechRecognition).SpeechRecognition
    || (window as unknown as WindowWithSpeechRecognition).webkitSpeechRecognition
    || null)
  : null;

export function supportsSpeechRecognition(): boolean {
  return Boolean(SpeechRecognitionClass);
}

export interface SpeechRecognitionOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (error: SpeechRecognitionErrorEvent) => void;
  lang?: string;
  continuous?: boolean;
}

export function startSpeechRecognition({ onTranscript, onEnd, onError, lang = 'en-US', continuous = true }: SpeechRecognitionOptions): () => void {
  if (!SpeechRecognitionClass) {
    onError?.({ error: 'not-supported', message: 'Speech recognition not supported' } as unknown as SpeechRecognitionErrorEvent);
    return () => {};
  }
  const rec = new SpeechRecognitionClass();
  rec.lang = lang;
  rec.continuous = continuous;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (event: Event) => {
    const e = event as SpeechRecognitionResultEvent;
    const result = e.results[e.results.length - 1];
    const transcript = result[0].transcript;
    const isFinal = result.isFinal;
    onTranscript?.(transcript, isFinal);
  };
  rec.onend = () => onEnd?.();
  rec.onerror = (e) => onError?.(e as unknown as SpeechRecognitionErrorEvent);
  rec.start();
  return () => { try { rec.stop(); } catch { /* ignore */ } };
}
