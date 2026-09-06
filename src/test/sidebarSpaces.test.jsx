import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

vi.mock('../components/ConnectorStatusIndicators', () => ({
  ConnectorStatusStrip: () => null,
  ConnectorStatusDot: () => null,
}));
vi.mock('../components/AgentStatusStrip', () => ({
  AgentStatusStrip: () => null,
}));
vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

const baseProps = {
  activeTab: 'mission',
  setActiveTab: vi.fn(),
  isOpen: true,
  onToggle: vi.fn(),
  conversations: [],
  activeChatId: null,
  setActiveChatId: vi.fn(),
  onCreateChat: vi.fn(),
  onDeleteChat: vi.fn(),
  settings: {},
  onToggleSearch: vi.fn(),
  ollamaConnected: false,
};

describe('Sidebar — 5 Space pills', () => {
  it('renders all 5 Space pills', () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByTestId('space-pill-home')).toBeTruthy();
    expect(screen.getByTestId('space-pill-work')).toBeTruthy();
    expect(screen.getByTestId('space-pill-research')).toBeTruthy();
    expect(screen.getByTestId('space-pill-boardroom')).toBeTruthy();
    expect(screen.getByTestId('space-pill-system')).toBeTruthy();
  });

  it('defaults to the Home space, showing Dashboard/Chat/Session History', () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByTestId('sidebar-nav-mission')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-chat')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-session_history')).toBeTruthy();
  });

  it('clicking the Work space pill shows Projects/Content/Automation/Creative, hides Home items', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-work'));
    expect(screen.getByTestId('sidebar-nav-project_execution')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-content')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-automation')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-miya')).toBeTruthy();
    expect(screen.queryByTestId('sidebar-nav-mission')).toBeNull();
  });

  it('clicking the Research space pill shows only Research Desk (Hector)', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-research'));
    expect(screen.getByTestId('sidebar-nav-hector')).toBeTruthy();
  });

  it('clicking the Boardroom space pill shows only Boardroom', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-boardroom'));
    expect(screen.getByTestId('sidebar-nav-mission_room')).toBeTruthy();
  });

  it('clicking the System space pill shows Orchestrator/All Agents/Agent Performance/Runtimes/Voice/Connectors/Operator', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-system'));
    expect(screen.getByTestId('sidebar-nav-orchestrator')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-ecosystem')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-agent_performance')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-runtimes')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-voice')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-connectors')).toBeTruthy();
    expect(screen.getByTestId('sidebar-nav-operator')).toBeTruthy();
  });

  it('clicking a nav item still calls setActiveTab with its real id, regardless of which space it moved to', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('space-pill-work'));
    fireEvent.click(screen.getByTestId('sidebar-nav-miya'));
    expect(baseProps.setActiveTab).toHaveBeenCalledWith('miya');
  });

  it('the search field calls onToggleSearch when clicked', () => {
    render(<Sidebar {...baseProps} />);
    fireEvent.click(screen.getByTestId('sidebar-search-trigger'));
    expect(baseProps.onToggleSearch).toHaveBeenCalled();
  });

  it('shows a persistent Ollama status dot next to the search field, colored by connection state', () => {
    const { rerender } = render(<Sidebar {...baseProps} ollamaConnected={false} />);
    expect(screen.getByTestId('sidebar-ollama-dot').className).toMatch(/bg-\[var\(--text-4\)\]/);
    rerender(<Sidebar {...baseProps} ollamaConnected={true} />);
    expect(screen.getByTestId('sidebar-ollama-dot').className).toMatch(/bg-\[var\(--success\)\]/);
  });
});
