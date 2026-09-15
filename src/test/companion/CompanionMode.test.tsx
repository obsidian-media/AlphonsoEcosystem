import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../components/SmartVoiceButton', () => ({
  SmartVoiceButton: () => <button aria-label="mock-mic">mic</button>
}));

vi.mock('../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn().mockResolvedValue({ response: 'Mock reply from the agent.', done: true })
}));

import { CompanionMode } from '../../components/CompanionMode';
import { generateAgentLlmResponse } from '../../lib/ollama';

describe('CompanionMode', () => {
  it('defaults to Alphonso as the landing agent and shows all 9 agents', () => {
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Alphonso' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Ask me anything/)).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(9);
  });

  it('switching agent updates the greeting and quick-starts', () => {
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Miya' }));
    expect(screen.getByText(/Tell me what you want to create/)).toBeTruthy();
  });

  it('sending a message renders the user bubble immediately and the agent reply once resolved', async () => {
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'What can you help me with?' } });
    fireEvent.click(screen.getByLabelText('Send'));

    expect(screen.getByText('What can you help me with?')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Mock reply from the agent.')).toBeTruthy());
    expect(generateAgentLlmResponse).toHaveBeenCalledWith('alphonso', expect.objectContaining({ prompt: expect.stringContaining('What can you help me with?') }));
  });

  it('opens the menu drawer with the mode toggle', () => {
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Menu'));
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeTruthy();
  });
});
