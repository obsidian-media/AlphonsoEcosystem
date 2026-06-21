import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MicrophoneStatus } from '../components/MicrophoneStatus.jsx';
import { VOICE_STATES } from '../services/voiceService';

vi.mock('lucide-react', () => ({
  Mic: () => <svg data-testid="icon-mic" />,
  MicOff: () => <svg data-testid="icon-mic-off" />,
  ShieldAlert: () => <svg data-testid="icon-shield-alert" />,
}));

const makeStatus = (state, message = 'test message', privacyLabel = 'Mic Off') => ({
  state,
  message,
  privacyLabel,
  transcription: { available: false },
});

describe('MicrophoneStatus', () => {
  it('shows privacyLabel text', () => {
    render(
      <MicrophoneStatus voiceStatus={makeStatus(VOICE_STATES.IDLE, 'msg', 'Mic Off')} />
    );
    expect(screen.getByText('Mic Off')).toBeTruthy();
  });

  it('shows message text in non-compact mode', () => {
    render(
      <MicrophoneStatus voiceStatus={makeStatus(VOICE_STATES.IDLE, 'Ready to record')} />
    );
    expect(screen.getByText('Ready to record')).toBeTruthy();
  });

  it('hides message text in compact mode', () => {
    render(
      <MicrophoneStatus
        voiceStatus={makeStatus(VOICE_STATES.IDLE, 'Ready to record')}
        compact={true}
      />
    );
    expect(screen.queryByText('Ready to record')).toBeNull();
  });

  it('shows amber indicator for permission_denied state', () => {
    const { container } = render(
      <MicrophoneStatus voiceStatus={makeStatus(VOICE_STATES.PERMISSION_DENIED)} />
    );
    const indicator = container.querySelector('.bg-amber-400');
    expect(indicator).toBeTruthy();
  });

  it('shows red indicator for listening state', () => {
    const { container } = render(
      <MicrophoneStatus voiceStatus={makeStatus(VOICE_STATES.LISTENING)} />
    );
    const indicator = container.querySelector('.bg-red-400');
    expect(indicator).toBeTruthy();
  });
});
