// Phase 3a: a brand's fixed posting times, edited in the Brands tab.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandEditor } from '../../../components/miya/BrandEditor';
import { getBrand, saveBrand } from '../../../services/contentFactory/contentBrandService';

beforeEach(() => localStorage.clear());

describe('BrandEditor posting times', () => {
  it('adds, edits and removes posting times, and saves them with the brand', () => {
    const brand = saveBrand({ name: 'Acme' });
    render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a posting time' }));
    fireEvent.change(screen.getByLabelText('Posting time 1 platform'), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText('Posting time 1 day'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Posting time 1 time'), { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a posting time' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove posting time 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save brand' }));
    expect(getBrand(brand.id)!.postingSlots).toEqual([{ platform: 'instagram', day: 3, time: '19:30' }]);
  });

  it('shows the times a brand already has', () => {
    const brand = saveBrand({ name: 'Acme', postingSlots: [{ platform: 'youtube', day: 2, time: '17:00' }] });
    render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
    expect((screen.getByLabelText('Posting time 1 platform') as HTMLSelectElement).value).toBe('youtube');
    expect((screen.getByLabelText('Posting time 1 day') as HTMLSelectElement).value).toBe('2');
    expect((screen.getByLabelText('Posting time 1 time') as HTMLInputElement).value).toBe('17:00');
  });
});

// Phase 3c: each brand chooses its carousel shape.
it('saves the carousel shape, 4:5 by default', () => {
  const brand = saveBrand({ name: 'Acme' });
  render(<BrandEditor brandId={brand.id} onBrand={() => undefined} />);
  const shape = screen.getByLabelText('Carousel shape') as HTMLSelectElement;
  expect(shape.value).toBe('4:5');
  fireEvent.change(shape, { target: { value: '1:1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save brand' }));
  expect(getBrand(brand.id)!.carouselShape).toBe('1:1');
});
