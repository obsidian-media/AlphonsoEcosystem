import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../agents/agentRegistry', () => ({
  listAgentProfiles: () => [
    { id: 'jose', name: 'Jose', accentColor: 'amber' },
    { id: 'hector', name: 'Hector', accentColor: 'violet' }
  ]
}));

describe('BoardroomChatView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the empty state with no threads', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);
    expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
  });

  it('creates a thread and shows it in the thread list', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Q3 Growth Plan' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));

    expect(await screen.findByText('Q3 Growth Plan')).toBeInTheDocument();
  });

  it('sends a message as the selected speaker and shows it in the thread', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Test Thread' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Test Thread');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: 'Hello room' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Hello room')).toBeInTheDocument();
  });

  it('shows an @mention autocomplete dropdown when typing @ in the composer', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mention Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mention Test');

    const composer = screen.getByPlaceholderText(/message the room/i);
    fireEvent.change(composer, { target: { value: '@Hec' } });

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /hector/i })).toBeInTheDocument();
  });

  it('inserts the selected agent name when an autocomplete option is clicked', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mention Test 2' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mention Test 2');

    const composer = screen.getByPlaceholderText(/message the room/i);
    fireEvent.change(composer, { target: { value: '@Hec' } });
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: /hector/i }));

    expect(composer.value).toBe('@Hector ');
  });

  it('shows a mentioned-agent tag on a sent message that contains an @mention', async () => {
    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Mention Test 3' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Mention Test 3');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector please look at this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('→ Hector')).toBeInTheDocument();
  });
});
