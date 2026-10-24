// Phase 4a: a post's numbers, compared with its brand, with Refresh.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/contentFactory/postMetrics', async () => ({
  ...(await vi.importActual<typeof import('../../../services/contentFactory/postMetrics')>('../../../services/contentFactory/postMetrics')),
  refreshPostMetrics: vi.fn(async () => ({ ok: false, reason: 'Refreshed a moment ago; try again in a few minutes.' })),
}));

import { PostNumbers } from '../../../components/miya/PostNumbers';
import { BrandResults } from '../../../components/miya/BrandResults';
import { refreshPostMetrics } from '../../../services/contentFactory/postMetrics';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief } from '../../../services/contentFactory/contentProjectService';
import { savePosts } from '../../../services/contentFactory/contentPosts';
import type { ProjectPost } from '../../../services/contentFactory/contentTypes';

const NOW = Date.UTC(2026, 9, 24);
const post = (patch: Partial<ProjectPost> = {}): ProjectPost => ({
  id: 'p1', platform: 'instagram', piece: 'reel', file: 'f', title: 'Launch reel', caption: '', hashtags: [], scheduledAtMs: NOW,
  status: 'posted', platformId: '1', sentAtMs: NOW, ...patch,
});
const reading = (values: Record<string, number>, unavailable: string[] = []) => ({ readAtMs: NOW, values, unavailable });

beforeEach(() => localStorage.clear());

describe('PostNumbers', () => {
  it('shows the latest numbers; a missing one shows — and why, never 0', () => {
    render(<PostNumbers projectId="p" brandId="b" post={post({ metrics: { readings: { '1d': reading({ views: 1200, reach: 800 }, ['saves']) } } })} />);
    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('views')).toBeTruthy();
    const saves = screen.getByTestId('metric-saves');
    expect(saves.textContent).toContain('—');
    expect(saves.getAttribute('title')).toBe('not available from Instagram');
    expect(screen.getByText(/after 1 day/)).toBeTruthy();
  });

  it('a removed post says removed from Instagram', () => {
    render(<PostNumbers projectId="p" brandId="b" post={post({ metrics: { readings: {}, removed: true } })} />);
    expect(screen.getByText('— removed from Instagram')).toBeTruthy();
  });

  it('a post with no numbers yet says so', () => {
    render(<PostNumbers projectId="p" brandId="b" post={post()} />);
    expect(screen.getByText('No numbers yet.')).toBeTruthy();
  });

  it('first posts say there is nothing to compare with yet', () => {
    render(<PostNumbers projectId="p" brandId="b" post={post({ metrics: { readings: { '7d': reading({ views: 5 }) } } })} />);
    expect(screen.getByText('First posts: nothing to compare with yet')).toBeTruthy();
  });

  it('Refresh reads now and shows a refusal', async () => {
    render(<PostNumbers projectId="p" brandId="b" post={post({ metrics: { readings: { '1h': reading({ views: 3 }) } } })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh numbers' }));
    await waitFor(() => expect(refreshPostMetrics).toHaveBeenCalledWith('p', 'p1'));
    expect(await screen.findByText('Refreshed a moment ago; try again in a few minutes.')).toBeTruthy();
  });
});

describe('BrandResults', () => {
  it("lists the brand's posts with 7-day numbers and bands, and the sign-in banner", () => {
    localStorage.setItem('alphonso_metrics_permissions_v1', JSON.stringify({ youtube: true }));
    const b = saveBrand({ name: 'Acme' });
    const p = createProject(b.id, 'Launch', emptyBrief());
    savePosts(p.id, ['a', 'b', 'c', 'd'].map((id, i) => post({ id, title: `Post ${id}`, metrics: { readings: { '7d': reading({ views: [100, 200, 300, 900][i] }) } } })));
    render(<BrandResults brandId={b.id} />);
    expect(screen.getByRole('region', { name: 'Results' })).toBeTruthy();
    expect(screen.getByText('Post d')).toBeTruthy();
    expect(screen.getByTestId('result-d').textContent).toContain('good');
    expect(screen.getByText('Sign in again to see YouTube numbers')).toBeTruthy();
  });

  it('with no numbers yet it says so', () => {
    const b = saveBrand({ name: 'Acme' });
    render(<BrandResults brandId={b.id} />);
    expect(screen.getByText(/No numbers yet/)).toBeTruthy();
  });
});
