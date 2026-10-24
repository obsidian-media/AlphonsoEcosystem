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
    // Agent roles Part A: the agent says what it owns, and points elsewhere for the rest.
    const prompt = String(vi.mocked(generateAgentLlmResponse).mock.calls.at(-1)![1].prompt);
    expect(prompt).toContain('You own: Code (front-end too)');
    expect(prompt).toContain("If asked for work you don't own, say which agent does it.");
  });

  it('opens the menu drawer with the mode toggle', () => {
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Menu'));
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeTruthy();
  });

  // QA 2026-10-22: "Find sources on..." was sent unfinished, so Hector had to
  // ask which area. A quick start ending in "..." now goes into the box.
  it('an unfinished quick start fills the message box instead of sending', () => {
    vi.mocked(generateAgentLlmResponse).mockClear();
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Hector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find sources on...' }));
    expect((screen.getByLabelText('Message') as HTMLInputElement).value).toBe('Find sources on ');
    expect(generateAgentLlmResponse).not.toHaveBeenCalled();
  });

  it('a complete quick start is sent straight away', async () => {
    vi.mocked(generateAgentLlmResponse).mockClear();
    render(<CompanionMode uxMode="simple" onModeChange={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Echo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remind me what happened last time' }));
    await waitFor(() => expect(generateAgentLlmResponse).toHaveBeenCalled());
  });
});
