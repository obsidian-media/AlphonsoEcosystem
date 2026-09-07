import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntentSelection } from '../../components/setup/IntentSelection';

describe('IntentSelection', () => {
  it('renders all 4 intent tiles', () => {
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.getByText('Chat Only')).toBeInTheDocument();
    expect(screen.getByText('Chat + Images')).toBeInTheDocument();
    expect(screen.getByText('Chat + Voice')).toBeInTheDocument();
    expect(screen.getByText('Full Power Mode')).toBeInTheDocument();
  });

  it('does not offer a Custom tile while that flow is unimplemented', () => {
    // Regression: the tile used to exist and silently completed Setup
    // without installing anything, despite promising component selection.
    render(<IntentSelection onSelect={() => {}} />);
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('calls onSelect with the tile id when a tile is clicked', () => {
    const onSelect = vi.fn();
    render(<IntentSelection onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Chat + Images'));
    expect(onSelect).toHaveBeenCalledWith('chat-images');
  });
});
