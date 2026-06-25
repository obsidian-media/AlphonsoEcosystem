import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceInputButton } from '../components/VoiceInputButton.jsx';
import { VOICE_STATES } from '../services/voiceService';

vi.mock('lucide-react', () => ({
  Mic: () => <svg data-testid="icon-mic" />,
  MicOff: () => <svg data-testid="icon-mic-off" />,
  AlertCircle: () => <svg data-testid="icon-alert-circle" />,
}));

const makeStatus = (state, message = 'test message', privacyLabel = 'Mic Off') => ({
  state,
  message,
  privacyLabel,
  transcription: { available: false },
});

describe('VoiceInputButton', () => {
  it('renders button in idle state', () => {
    render(<VoiceInputButton voiceStatus={makeStatus(VOICE_STATES.IDLE)} onToggle={() => {}} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('shows "STOP" in listening state', () => {
    render(<VoiceInputButton voiceStatus={makeStatus(VOICE_STATES.LISTENING)} onToggle={() => {}} />);
    expect(screen.getByText('STOP')).toBeTruthy();
  });

  it('shows "REQUESTING MIC…" in requesting_permission state', () => {
    render(
      <VoiceInputButton
        voiceStatus={makeStatus(VOICE_STATES.REQUESTING_PERMISSION)}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText('REQUESTING MIC…')).toBeTruthy();
  });

  it('button is disabled in unsupported state', () => {
    render(
      <VoiceInputButton
        voiceStatus={makeStatus(VOICE_STATES.UNSUPPORTED)}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole('button').disabled).toBe(true);
  });

  it('button is disabled in requesting_permission state', () => {
    render(
      <VoiceInputButton
        voiceStatus={makeStatus(VOICE_STATES.REQUESTING_PERMISSION)}
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole('button').disabled).toBe(true);
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<VoiceInputButton voiceStatus={makeStatus(VOICE_STATES.IDLE)} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
