import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelection } from '../../components/setup/IntentSelection';

describe('IntentSelection', () => {
  it('renders all 5 intent tiles', () => {
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.getByText('Chat Only')).toBeInTheDocument();
    expect(screen.getByText('Chat + Images')).toBeInTheDocument();
    expect(screen.getByText('Chat + Voice')).toBeInTheDocument();
    expect(screen.getByText('Full Power Mode')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls onSelect with the tile id when a tile is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Chat + Images'));
    expect(onSelect).toHaveBeenCalledWith('chat-images');
  });

  it('calls onSelect with "custom" when Custom is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(onSelect).toHaveBeenCalledWith('custom');
  });
});
