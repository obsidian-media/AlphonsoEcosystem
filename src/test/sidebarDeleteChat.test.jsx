import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Regression test for a real QA finding (Q&A E2E Test.md, Round 2 N-9):
// "Delete chat has no confirmation. 'Delete chat: New Chat Session' wipes
// the conversation instantly — no dialog, no undo. Destructive + irreversible
// + one click."

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() })
}));

vi.mock('../components/ConnectorStatusIndicators', () => ({
  ConnectorStatusStrip: () => <div data-testid="connector-status-strip" />,
  ConnectorStatusDot: () => <span data-testid="connector-status-dot" />
}));

vi.mock('../components/AgentStatusStrip', () => ({
  AgentStatusStrip: () => <div data-testid="agent-status-strip" />
}));

import { Sidebar } from '../components/Sidebar';

function makeProps(overrides = {}) {
  return {
    activeTab: 'chat',
    setActiveTab: vi.fn(),
    isOpen: true,
    onToggle: vi.fn(),
    conversations: [{ id: 'default-session', title: 'New Chat Session' }],
    activeChatId: 'default-session',
    setActiveChatId: vi.fn(),
    onCreateChat: vi.fn(),
    onDeleteChat: vi.fn(),
    settings: {},
    ...overrides
  };
}

describe('Sidebar delete-chat confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not delete on the first click', () => {
    const onDeleteChat = vi.fn();
    render(<Sidebar {...makeProps({ onDeleteChat })} />);

    fireEvent.click(screen.getByLabelText('Delete chat: New Chat Session'));

    expect(onDeleteChat).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Confirm delete chat: New Chat Session')).toBeInTheDocument();
  });

  it('deletes on a second click (confirm)', () => {
    const onDeleteChat = vi.fn();
    render(<Sidebar {...makeProps({ onDeleteChat })} />);

    fireEvent.click(screen.getByLabelText('Delete chat: New Chat Session'));
    fireEvent.click(screen.getByLabelText('Confirm delete chat: New Chat Session'));

    expect(onDeleteChat).toHaveBeenCalledTimes(1);
    expect(onDeleteChat).toHaveBeenCalledWith('default-session', expect.anything());
  });

  it('resets the confirm state after a timeout without a second click', () => {
    const onDeleteChat = vi.fn();
    render(<Sidebar {...makeProps({ onDeleteChat })} />);

    fireEvent.click(screen.getByLabelText('Delete chat: New Chat Session'));
    expect(screen.getByLabelText('Confirm delete chat: New Chat Session')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3100); });

    expect(screen.getByLabelText('Delete chat: New Chat Session')).toBeInTheDocument();
    expect(onDeleteChat).not.toHaveBeenCalled();
  });
});
