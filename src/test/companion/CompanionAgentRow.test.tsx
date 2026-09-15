import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompanionAgentRow } from '../../components/companion/CompanionAgentRow';

const AGENTS = [
  { id: 'alphonso', name: 'Alphonso' },
  { id: 'jose', name: 'Jose' },
  { id: 'hector', name: 'Hector' },
  { id: 'miya', name: 'Miya' },
  { id: 'maria', name: 'Maria' },
  { id: 'marcus', name: 'Marcus' },
  { id: 'echo', name: 'Echo' },
  { id: 'sentinel', name: 'Sentinel' },
  { id: 'nova', name: 'Nova' }
];

describe('CompanionAgentRow', () => {
  it('renders all 9 real agents', () => {
    render(<CompanionAgentRow agents={AGENTS} activeAgentId="alphonso" onSelectAgent={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(9);
  });

  it('marks the active agent as selected and others as not', () => {
    render(<CompanionAgentRow agents={AGENTS} activeAgentId="miya" onSelectAgent={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Miya' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Alphonso' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelectAgent with the clicked agent id', () => {
    const onSelectAgent = vi.fn();
    render(<CompanionAgentRow agents={AGENTS} activeAgentId="alphonso" onSelectAgent={onSelectAgent} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Hector' }));
    expect(onSelectAgent).toHaveBeenCalledWith('hector');
  });
});
