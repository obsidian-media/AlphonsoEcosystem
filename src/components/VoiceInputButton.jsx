import React from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { VOICE_STATES, TRANSCRIPTION_PIPELINE_STATUS } from '../services/voiceService';

export function VoiceInputButton({ voiceStatus, onToggle }) {
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
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border rounded-t-lg text-[10px] transition-colors ${
        listening
          ? 'border-red-500/40 text-red-300'
          : requesting
            ? 'border-blue-500/30 text-blue-300 cursor-wait'
            : blocked
              ? 'border-amber-500/30 text-amber-300'
              : noTranscription
                ? 'border-amber-500/20 text-amber-400/60 cursor-help'
                : 'border-white/5 text-zinc-500 hover:text-white'
      }`}
      title={title}
    >
      {listening ? <MicOff className="w-3 h-3" /> : noTranscription ? <AlertCircle className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
      {label}
    </button>
  );
}
