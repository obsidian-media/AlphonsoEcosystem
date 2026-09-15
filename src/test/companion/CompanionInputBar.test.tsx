import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../components/SmartVoiceButton', () => ({
  SmartVoiceButton: () => <button aria-label="mock-mic">mic</button>
}));

import { CompanionInputBar } from '../../components/companion/CompanionInputBar';

describe('CompanionInputBar', () => {
  it('calls onSend with trimmed text and clears the input', () => {
    const onSend = vi.fn();
    render(<CompanionInputBar agentEmoji="💬" onSend={onSend} />);
    const input = screen.getByLabelText('Message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  hello world  ' } });
    fireEvent.click(screen.getByLabelText('Send'));
    expect(onSend).toHaveBeenCalledWith('hello world');
    expect(input.value).toBe('');
  });

  it('submits on Enter without shift', () => {
    const onSend = vi.fn();
    render(<CompanionInputBar agentEmoji="🔎" onSend={onSend} />);
    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'research this' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('research this');
  });

  it('does not call onSend for empty/whitespace-only input', () => {
    const onSend = vi.fn();
    render(<CompanionInputBar agentEmoji="💬" onSend={onSend} />);
    fireEvent.click(screen.getByLabelText('Send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables send when disabled prop is true', () => {
    const onSend = vi.fn();
    render(<CompanionInputBar agentEmoji="💬" onSend={onSend} disabled />);
    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.click(screen.getByLabelText('Send'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
