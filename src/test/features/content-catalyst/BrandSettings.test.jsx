import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandSettings } from '../../../features/content-catalyst/workspace/BrandSettings';

describe('BrandSettings', () => {
  it('renders the Save Brand Profile button', () => {
    render(<BrandSettings brandProfile={{}} onSave={vi.fn()} />);
    expect(screen.getByText('Save Brand Profile')).toBeTruthy();
  });

  it('calls onSave with the edited brand name when clicked', () => {
    const onSave = vi.fn();
    render(<BrandSettings brandProfile={{}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Brand name'), { target: { value: 'Acme Co' } });
    fireEvent.click(screen.getByText('Save Brand Profile'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand_name: 'Acme Co' }));
  });
});
