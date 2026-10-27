import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

  it('creates a pair when trigger provided', async () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    fireEvent.change(screen.getByPlaceholderText(/Trigger condition/), { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    // Component renders "(1 pair)" in a span — use regex for substring match
    await waitFor(() => expect(screen.getByText(/\(1 pair\)/)).toBeDefined(), { timeout: 3000 });
  });

  it('blocks duplicate pairings', async () => {
    render(<AgentPairingView />);
    // First pair
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    let triggerInput = await screen.findByPlaceholderText(/Trigger condition/, {}, { timeout: 3000 });
    fireEvent.change(triggerInput, { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    // Wait for pair to appear
    await waitFor(() => screen.getByText(/\(1 pair\)/), { timeout: 3000 });
    // Second pair same agents (use getAllByText[0] — pair list also shows agent names)
    fireEvent.click(screen.getAllByText('Alphonso')[0]);
    fireEvent.click(screen.getAllByText('Jose')[0]);
    triggerInput = await screen.findByPlaceholderText(/Trigger condition/, {}, { timeout: 3000 });
    fireEvent.change(triggerInput, { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    await waitFor(() => expect(screen.getByText('A pairing between these two agents already exists.')).toBeDefined(), { timeout: 3000 });
  });

  it('deletes a pair', async () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    fireEvent.click(screen.getByText('Jose'));
    fireEvent.change(screen.getByPlaceholderText(/Trigger condition/), { target: { value: 'on_task_complete' } });
    fireEvent.click(screen.getByText('Create Pair'));
    const deleteButton = await screen.findByLabelText('Delete pair', {}, { timeout: 3000 });
    fireEvent.click(deleteButton);
    await waitFor(() => expect(screen.getByText(/No agent pairs defined yet/)).toBeDefined(), { timeout: 3000 });
  });

  it('shows empty state when no pairs', () => {
    render(<AgentPairingView />);
    expect(screen.getByText(/No agent pairs defined yet/)).toBeDefined();
  });

  it('deselects agent when clicked twice (prevents self-pairing via UI)', () => {
    render(<AgentPairingView />);
    fireEvent.click(screen.getByText('Alphonso'));
    // After first click: step 2 (B selection)
    expect(screen.getByText(/Step 2/)).toBeDefined();
    fireEvent.click(screen.getByText('Alphonso'));
    // After second click: back to step 1 (A deselected)
    expect(screen.getByText('Step 1 — Select Agent A')).toBeDefined();
  });
});