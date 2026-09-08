import React from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { VOICE_STATES, TRANSCRIPTION_PIPELINE_STATUS } from '../services/voiceService';

interface Props {
  voiceStatus: { state: string; message: string };
  onToggle: () => void;
}

export function VoiceInputButton({ voiceStatus, onToggle }: Props) {
  const listening = voiceStatus.state === VOICE_STATES.LISTENING;
  const requesting = voiceStatus.state === VOICE_STATES.REQUESTING_PERMISSION;
  const blocked = [
    VOICE_STATES.PERMISSION_DENIED,
    VOICE_STATES.NO_MICROPHONE,
    VOICE_STATES.UNSUPPORTED,
    VOICE_STATES.ERROR
  ].includes(voiceStatus.state);
  const noTranscription = !TRANSCRIPTION_PIPELINE_STATUS.available;

  const label = listening
    ? 'STOP'
    : requesting
      ? 'REQUESTING MIC…'
      : noTranscription
        ? 'MIC (NO STT)'
        : 'VOICE INPUT';

  const title = noTranscription
    ? 'Microphone works but speech-to-text is not available in this environment. Your words will not appear as text.'
    : voiceStatus.message;

  return (
    <button
      onClick={onToggle}
      disabled={requesting || voiceStatus.state === VOICE_STATES.UNSUPPORTED}
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-1)] border rounded-t-lg text-[10px] transition-colors ${
        listening
          ? 'border-[var(--error-border)] text-[var(--error)]'
          : requesting
            ? 'border-[var(--info-border)] text-[var(--info)] cursor-wait'
            : blocked
              ? 'border-[var(--warning-border)] text-[var(--warning)]'
              : noTranscription
                ? 'border-[var(--warning-border)] text-[var(--warning)] cursor-help'
                : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)]'
      }`}
      title={title}
    >
      {listening ? <MicOff className="w-3 h-3" /> : noTranscription ? <AlertCircle className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
      {label}
    </button>
  );
}
