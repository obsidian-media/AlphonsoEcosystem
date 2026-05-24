import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { VOICE_STATES } from '../services/voiceService';

export function VoiceInputButton({ voiceStatus, onToggle }) {
  const listening = voiceStatus.state === VOICE_STATES.LISTENING;
  const requesting = voiceStatus.state === VOICE_STATES.REQUESTING_PERMISSION;
  const blocked = [
    VOICE_STATES.PERMISSION_DENIED,
    VOICE_STATES.NO_MICROPHONE,
    VOICE_STATES.UNSUPPORTED,
    VOICE_STATES.ERROR
  ].includes(voiceStatus.state);

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
              : 'border-white/5 text-zinc-500 hover:text-white'
      }`}
      title={voiceStatus.message}
    >
      {listening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
      {listening ? 'STOP LISTENING' : requesting ? 'REQUESTING MIC' : 'VOICE INPUT'}
    </button>
  );
}
