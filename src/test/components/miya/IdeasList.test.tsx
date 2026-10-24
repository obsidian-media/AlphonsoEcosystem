// Phase 4a: the brand's ideas, and suggested post times, in the Brands tab.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdeasList } from '../../../components/miya/IdeasList';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { listProjects } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => localStorage.clear());

describe('IdeasList', () => {
  it('lists new ideas with Start project and Dismiss', () => {
    const brand = saveBrand({ name: 'Acme' });
    localStorage.setItem('alphonso_content_ideas_v1', JSON.stringify([
      { id: 'i1', brandId: brand.id, text: 'Part two', fromPost: { projectId: 'p', postId: 'a' }, atMs: 1, status: 'new' },
      { id: 'i2', brandId: brand.id, text: 'For tea', fromPost: { projectId: 'p', postId: 'a' }, atMs: 2, status: 'new' },
    ]));
    const onStarted = vi.fn();
    render(<IdeasList brandId={brand.id} onStarted={onStarted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start project: Part two' }));
    expect(listProjects(brand.id).map((p) => p.name)).toEqual(['Part two']);
    expect(onStarted).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss idea: For tea' }));
    expect(screen.queryByText('For tea')).toBeNull();
    expect(screen.getByText(/No ideas yet/)).toBeTruthy();
  });
});
