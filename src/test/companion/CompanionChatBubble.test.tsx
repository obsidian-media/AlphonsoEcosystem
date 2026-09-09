import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompanionChatBubble } from '../../components/companion/CompanionChatBubble';

describe('CompanionChatBubble', () => {
  it('renders a user message without an agent avatar', () => {
    render(<CompanionChatBubble message={{ id: '1', role: 'user', text: 'Hello there' }} />);
    expect(screen.getByText('Hello there')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders an agent message with its avatar', () => {
    render(<CompanionChatBubble message={{ id: '2', role: 'agent', agentId: 'miya', agentName: 'Miya', text: 'Hi, I can help with that.' }} />);
    expect(screen.getByText('Hi, I can help with that.')).toBeTruthy();
  });

  it('renders a typing indicator instead of text when pending', () => {
    render(<CompanionChatBubble message={{ id: '3', role: 'agent', agentId: 'hector', text: '', pending: true }} />);
    expect(screen.getByLabelText('Typing')).toBeTruthy();
  });
});
