import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelection } from '../../components/setup/IntentSelection';

describe('IntentSelection', () => {
  it('renders all 5 intent tiles, including Custom now that the agent grid exists', () => {
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.getByText('Chat Only')).toBeInTheDocument();
    expect(screen.getByText('Chat + Images')).toBeInTheDocument();
    expect(screen.getByText('Chat + Voice')).toBeInTheDocument();
    expect(screen.getByText('Full Power Mode')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls onSelect with "custom" when the Custom tile is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(onSelect).toHaveBeenCalledWith('custom');
  });

  it('calls onSelect with the tile id when a tile is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Chat + Images'));
    expect(onSelect).toHaveBeenCalledWith('chat-images');
  });

  it('gives each tile an accessible name carrying both the choice and its cost', () => {
    // Without an explicit label a screen reader reads the two child spans as
    // one run-on string ("Chat + Images Adds Fooocus, ~15GB").
    render(<IntentSelection onSelect={() => {}} />);
    const tile = screen.getByRole('button', { name: /chat \+ images.*fooocus/i });
    expect(tile).toBeInTheDocument();
  });

  it('exposes every tile as a button, so all five are keyboard reachable', () => {
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('labels the tile group so its purpose is announced', () => {
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.getByRole('group', { name: /what do you want alphonso to do/i })).toBeInTheDocument();
  });
});
