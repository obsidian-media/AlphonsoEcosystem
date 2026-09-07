import React, { useState } from 'react';
import { SmartVoiceButton } from '../SmartVoiceButton';

interface Props {
  agentEmoji: string;
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function CompanionInputBar({ agentEmoji, onSend, disabled = false }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="flex items-center gap-2 rounded-full bg-[var(--companion-bubble-theirs)] backdrop-blur-md px-3 py-2 shadow-sm">
      <span className="text-lg leading-none select-none" aria-hidden="true">{agentEmoji}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Message..."
        disabled={disabled}
        className="flex-1 bg-transparent text-sm text-[var(--companion-bubble-theirs-text)] placeholder:text-[var(--companion-text-muted)] outline-none min-w-0"
        aria-label="Message"
      />
      <SmartVoiceButton />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="rounded-full bg-[var(--companion-bubble-mine)] text-[var(--companion-bubble-mine-text)] h-8 w-8 flex items-center justify-center shrink-0 disabled:opacity-40"
      >
        →
      </button>
    </div>
  );
}
