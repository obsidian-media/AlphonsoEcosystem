import React from 'react';
import { Mic, MicOff, ShieldAlert } from 'lucide-react';
import { VOICE_STATES } from '../services/voiceService';

interface VoiceStatus {
  state: string;
  privacyLabel: string;
  message: string;
}

interface Props {
  voiceStatus: VoiceStatus;
  compact?: boolean;
}

export function MicrophoneStatus({ voiceStatus, compact = false }: Props) {
  const listening = voiceStatus.state === VOICE_STATES.LISTENING;
  const blocked = [
    VOICE_STATES.PERMISSION_DENIED,
    VOICE_STATES.NO_MICROPHONE,
    VOICE_STATES.UNSUPPORTED,
    VOICE_STATES.ERROR
  ].includes(voiceStatus.state);

  const Icon = blocked ? ShieldAlert : listening ? Mic : MicOff;

  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'} text-[var(--text-3)]`}>
      <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${
        listening ? 'bg-[var(--error)]' : blocked ? 'bg-[var(--warning)]' : 'bg-[var(--text-4)]'
      }`}>
        {listening && <span className="absolute inset-0 rounded-full bg-[var(--error)] animate-ping opacity-60" />}
      </span>
      <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      <span className="font-medium text-[var(--text-2)]">{voiceStatus.privacyLabel}</span>
      {!compact && <span className="text-[var(--text-3)]">{voiceStatus.message}</span>}
    </div>
  );
}
