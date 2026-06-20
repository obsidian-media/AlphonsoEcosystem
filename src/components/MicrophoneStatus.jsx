import React from 'react';
import { Mic, MicOff, ShieldAlert } from 'lucide-react';
import { VOICE_STATES } from '../services/voiceService';

export function MicrophoneStatus({ voiceStatus, compact = false }) {
  const listening = voiceStatus.state === VOICE_STATES.LISTENING;
  const blocked = [
    VOICE_STATES.PERMISSION_DENIED,
    VOICE_STATES.NO_MICROPHONE,
    VOICE_STATES.UNSUPPORTED,
    VOICE_STATES.ERROR
  ].includes(voiceStatus.state);

  const Icon = blocked ? ShieldAlert : listening ? Mic : MicOff;

  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'} text-zinc-400`}>
      <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${
        listening ? 'bg-red-400' : blocked ? 'bg-amber-400' : 'bg-zinc-600'
      }`}>
        {listening && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />}
      </span>
      <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      <span className="font-medium text-zinc-300">{voiceStatus.privacyLabel}</span>
      {!compact && <span className="text-zinc-500">{voiceStatus.message}</span>}
    </div>
  );
}
