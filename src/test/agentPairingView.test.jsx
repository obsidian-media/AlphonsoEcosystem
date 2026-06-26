import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

vi.mock('../agents/agentRegistry', () => ({
  listAgentProfiles: vi.fn().mockReturnValue([
    { id: 'alphonso', name: 'Alphonso', role: 'operator' },
    { id: 'jose', name: 'Jose', role: 'orchestrator' },
    { id: 'miya', name: 'Miya', role: 'creator' },
    { id: 'hector', name: 'Hector', role: 'researcher' },
    { id: 'maria', name: 'Maria', role: 'governance' },
    { id: 'marcus', name: 'Marcus', role: 'distribution' },
    { id: 'echo', name: 'Echo', role: 'memory' },
    { id: 'sentinel', name: 'Sentinel', role: 'security' },
    { id: 'nova', name: 'Nova', role: 'insight' }
  ])
}));

import { AgentPairingView } from '../components/AgentPairingView';

describe('AgentPairingView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(<AgentPairingView />);
    expect(screen.getByText('Agent Pairing')).toBeDefined();
  });

  it('shows step 1 initially', () => {
    render(<AgentPairingView />);
    expect(screen.getByText('Step 1 — Select Agent A')).toBeDefined();
  });

  it('allows selecting two agents', () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    expect(screen.getByText('Step 2 — Select Agent B (pairing with Alphonso)')).toBeDefined();
    fireEvent.click(screen.getByText('Jose'));
    expect(screen.getByText('Step 3 — Define trigger for Alphonso ↔ Jose')).toBeDefined();
  });

  it('creates a pair when trigger provided', () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    fireEvent.change(screen.getByPlaceholderText(/Trigger condition/), { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    expect(screen.getByText('1 pair')).toBeDefined();
  });

  it('blocks duplicate pairings', () => {
    render(<AgentPairingView />);
    // First pair
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    fireEvent.change(screen.getByPlaceholderText(/Trigger condition/), { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    // Second pair same agents
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    fireEvent.change(screen.getByPlaceholderText(/Trigger condition/), { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    expect(screen.getByText('A pairing between these two agents already exists.')).toBeDefined();
  });

  it('deletes a pair', () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    fireEvent.change(screen.getByPlaceholderText(/Trigger condition/), { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    const deleteButton = screen.getByLabelText('Delete pair');
    fireEvent.click(deleteButton);
    expect(screen.getByText('No agent pairs defined yet.')).toBeDefined();
  });

  it('shows empty state when no pairs', () => {
    render(<AgentPairingView />);
    expect(screen.getByText('No agent pairs defined yet.')).toBeDefined();
  });

  it('prevents pairing agent with itself', () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Alphonso'));
    expect(screen.getByText('Cannot pair an agent with itself.')).toBeDefined();
  });
});