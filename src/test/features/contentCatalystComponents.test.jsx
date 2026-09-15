import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TrendResearch } from '../../features/content-catalyst/workspace/TrendResearch';
import { DraftList } from '../../features/content-catalyst/workspace/DraftList';
import { AnalyticsDashboard } from '../../features/content-catalyst/workspace/AnalyticsDashboard';
import { GeneratorForm } from '../../features/content-catalyst/workspace/GeneratorForm';

describe('TrendResearch', () => {
  it('renders empty state when no suggestions', () => {
    render(<TrendResearch suggestions={[]} />);
    expect(screen.getByText(/No seeds yet/)).toBeTruthy();
  });

  it('renders suggestion buttons', () => {
    render(<TrendResearch suggestions={['Idea 1', 'Idea 2', 'Idea 3']} />);
    expect(screen.getByText('Idea 1')).toBeTruthy();
    expect(screen.getByText('Idea 2')).toBeTruthy();
    expect(screen.getByText('Idea 3')).toBeTruthy();
  });

  it('calls onUseIdea when suggestion clicked', () => {
    const onUseIdea = vi.fn();
    render(<TrendResearch suggestions={['Test idea']} onUseIdea={onUseIdea} />);
    fireEvent.click(screen.getByText('Test idea'));
    expect(onUseIdea).toHaveBeenCalledWith('Test idea');
  });

  it('renders header with Trend seeds text', () => {
    render(<TrendResearch />);
    expect(screen.getByText('Trend seeds')).toBeTruthy();
  });
});

describe('DraftList', () => {
  it('renders empty state when no drafts', () => {
    render(<DraftList drafts={[]} />);
    expect(screen.getByText(/No jobs yet/)).toBeTruthy();
  });

  it('shows draft count', () => {
    render(<DraftList drafts={[{ id: '1', idea: 'A' }, { id: '2', idea: 'B' }]} />);
    expect(screen.getByText('2 jobs')).toBeTruthy();
  });

  it('renders draft items', () => {
    render(<DraftList drafts={[{ id: 'd1', idea: 'First draft', platform: 'instagram', format: 'reel', status: 'drafting' }]} />);
    expect(screen.getByText('First draft')).toBeTruthy();
  });

  it('calls onSelect when draft clicked', () => {
    const onSelect = vi.fn();
    render(<DraftList drafts={[{ id: 'd1', idea: 'Click me' }]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Click me'));
    expect(onSelect).toHaveBeenCalledWith('d1');
  });

  it('shows Untitled for drafts without idea', () => {
    render(<DraftList drafts={[{ id: 'd1' }]} />);
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('renders header with History text', () => {
    render(<DraftList />);
    expect(screen.getByText('History')).toBeTruthy();
  });
});

describe('AnalyticsDashboard', () => {
  it('renders zeroed analytics by default', () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
  });

  it('displays provided analytics values', () => {
    render(<AnalyticsDashboard analytics={{ total: 10, ready: 5, published: 3, video: 2, voice: 1, failed: 0 }} />);
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders byPlatform breakdown when present', () => {
    render(<AnalyticsDashboard analytics={{ byPlatform: { instagram: 5, twitter: 3 } }} />);
    expect(screen.getByText('instagram')).toBeTruthy();
    expect(screen.getByText('twitter')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('hides byPlatform when empty', () => {
    render(<AnalyticsDashboard analytics={{ byPlatform: {} }} />);
    expect(screen.queryByText('By platform')).toBeNull();
  });

  it('renders header with Analytics text', () => {
    render(<AnalyticsDashboard />);
    expect(screen.getByText('Analytics')).toBeTruthy();
  });
});

describe('GeneratorForm', () => {
  const defaultForm = {
    idea: '',
    business_context: '',
    platform: 'instagram',
    format: 'post',
    tone: 'confident and polished',
    needs: { image: true, video: false, narration: false, publish: false },
  };

  it('renders the creative brief header', () => {
    render(<GeneratorForm form={defaultForm} setForm={vi.fn()} brandProfile={{}} />);
    expect(screen.getByText('Creative brief')).toBeTruthy();
  });

  it('renders idea textarea', () => {
    render(<GeneratorForm form={defaultForm} setForm={vi.fn()} brandProfile={{}} />);
    expect(screen.getByPlaceholderText("What's the idea? (required)")).toBeTruthy();
  });

  it('disables generate button when idea is empty', () => {
    render(<GeneratorForm form={defaultForm} setForm={vi.fn()} brandProfile={{}} isLoading={false} />);
    const btn = screen.getByRole('button', { name: /Create Content Job/i });
    expect(btn.disabled).toBe(true);
  });

  it('enables generate button when idea is present', () => {
    const form = { ...defaultForm, idea: 'Test idea' };
    render(<GeneratorForm form={form} setForm={vi.fn()} brandProfile={{}} isLoading={false} />);
    const btn = screen.getByRole('button', { name: /Create Content Job/i });
    expect(btn.disabled).toBe(false);
  });

  it('shows loading state', () => {
    const form = { ...defaultForm, idea: 'Test' };
    render(<GeneratorForm form={form} setForm={vi.fn()} brandProfile={{}} isLoading={true} />);
    expect(screen.getByText('Generating…')).toBeTruthy();
  });

  it('calls onGenerate when button clicked', () => {
    const onGenerate = vi.fn();
    const form = { ...defaultForm, idea: 'Test idea' };
    render(<GeneratorForm form={form} setForm={vi.fn()} brandProfile={{}} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /Create Content Job/i }));
    expect(onGenerate).toHaveBeenCalled();
  });

  it('calls setForm when idea textarea changes', () => {
    const setForm = vi.fn();
    render(<GeneratorForm form={defaultForm} setForm={setForm} brandProfile={{}} />);
    fireEvent.change(screen.getByPlaceholderText("What's the idea? (required)"), { target: { value: 'New idea' } });
    expect(setForm).toHaveBeenCalled();
  });

  it('renders need toggle buttons', () => {
    render(<GeneratorForm form={defaultForm} setForm={vi.fn()} brandProfile={{}} />);
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('Narration')).toBeTruthy();
    expect(screen.getByText('Publish')).toBeTruthy();
  });

  it('shows injected idea banner when provided', () => {
    render(<GeneratorForm form={defaultForm} setForm={vi.fn()} brandProfile={{}} injectedIdea="Trending topic" />);
    expect(screen.getByText('Trending topic')).toBeTruthy();
    expect(screen.getByText('Use')).toBeTruthy();
  });

  it('does not show injected idea banner when not provided', () => {
    render(<GeneratorForm form={defaultForm} setForm={vi.fn()} brandProfile={{}} />);
    expect(screen.queryByText('Use')).toBeNull();
  });
});
