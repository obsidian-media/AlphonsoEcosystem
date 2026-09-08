import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentStatusStrip } from '../../components/AgentStatusStrip';

vi.mock('../../agents/agentRegistry.js', () => ({
  listAgentProfiles: () => [
    { id: 'alphonso', name: 'Alphonso' },
    { id: 'jose', name: 'Jose' },
    { id: 'hector', name: 'Hector' },
  ],
}));

describe('AgentStatusStrip — default (dots) variant, unchanged', () => {
  it('renders nothing when there are no active agents and useAutoFeed is off', () => {
    const { container } = render(<AgentStatusStrip useAutoFeed={false} activeAgents={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a dot pill per active agent when variant is omitted (default)', () => {
    render(<AgentStatusStrip useAutoFeed={false} activeAgents={[{ name: 'jose', status: 'running' }]} />);
    expect(screen.getByText('jose')).toBeTruthy();
  });
});

describe('AgentStatusStrip — portraits variant', () => {
  it('renders all agents from listAgentProfiles, not just active ones', () => {
    render(<AgentStatusStrip variant="portraits" useAutoFeed={false} activeAgents={[{ name: 'jose', status: 'running' }]} />);
    expect(screen.getByAltText('Alphonso')).toBeTruthy();
    expect(screen.getByAltText('Jose')).toBeTruthy();
    expect(screen.getByAltText('Hector')).toBeTruthy();
  });

  it('marks the active agent distinctly from idle ones via a data attribute', () => {
    render(<AgentStatusStrip variant="portraits" useAutoFeed={false} activeAgents={[{ name: 'jose', status: 'running' }]} />);
    expect(screen.getByTestId('agent-portrait-jose').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('agent-portrait-alphonso').getAttribute('data-active')).toBe('false');
  });

  it('renders nothing extra when zero agents are active — idle agents still show, just all dimmed', () => {
    render(<AgentStatusStrip variant="portraits" useAutoFeed={false} activeAgents={[]} />);
    expect(screen.getByTestId('agent-portrait-alphonso').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('agent-portrait-jose').getAttribute('data-active')).toBe('false');
  });
});
