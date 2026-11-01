import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/hectorResearchService', () => {
  let reports: Record<string, unknown>[] = [];
  return {
    __resetReports: () => { reports = []; },
    __addReport: (r: Record<string, unknown>) => { reports.push(r); },
    createHectorApprovalPacket: vi.fn(),
    createResearchDraft: vi.fn((opts) => {
      const report = { id: 'draft-1', researchQuestion: opts.researchQuestion, status: 'draft', confidenceLevel: 'unknown' };
      reports.push(report);
      return report;
    }),
    fetchSuppliedSourcesForReport: vi.fn(),
    listHectorActivity: vi.fn(() => []),
    listHectorReports: vi.fn(() => reports),
  };
});
const hasSearchKey = vi.fn(async () => true);
vi.mock('../../../services/hector/searchChain', () => ({
  hasSearchKey: () => hasSearchKey(),
  FREE_SEARCH_NOTE: 'Hector is using free search, which can stop answering after many searches.',
}));
vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
  writeClipboard: vi.fn(async () => null),
}));

import { HectorResearchDesk } from '../../../components/dashboard/HectorResearchDesk';
import * as hectorResearchServiceModule from '../../../services/hectorResearchService';

describe('HectorResearchDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hectorResearchServiceModule as unknown as { __resetReports: () => void }).__resetReports();
  });

  it('says free search can stop answering when no search key is set up', async () => {
    hasSearchKey.mockResolvedValueOnce(false);
    render(<HectorResearchDesk />);
    expect(await screen.findByTestId('hector-free-search-note')).toBeTruthy();
  });

  it('shows no note once a search key is set up', async () => {
    render(<HectorResearchDesk />);
    await Promise.resolve();
    expect(screen.queryByTestId('hector-free-search-note')).toBeNull();
  });

  it('renders all 3 tabs, defaulting to New Research', () => {
    render(<HectorResearchDesk />);
    expect(screen.getByText('New Research')).toBeTruthy();
    expect(screen.getByText('Reports')).toBeTruthy();
    expect(screen.getByText('Live Run')).toBeTruthy();
    expect(screen.getByPlaceholderText('What do you want Hector to research?')).toBeTruthy();
  });

  it('switches to the Reports tab and shows the empty state when there are no reports', async () => {
    render(<HectorResearchDesk />);
    fireEvent.click(screen.getByText('Reports'));
    expect(await screen.findByText('No research reports yet')).toBeTruthy();
  });

  it('creating a research draft switches to the Reports tab', async () => {
    render(<HectorResearchDesk />);
    fireEvent.change(screen.getByPlaceholderText('What do you want Hector to research?'), { target: { value: 'What is Alphonso?' } });
    fireEvent.click(screen.getByText('Create Research Draft'));
    expect(await screen.findByText('All Reports')).toBeTruthy();
  });

  it('switches to the Live Run tab and shows the select-a-report prompt with no report selected', async () => {
    render(<HectorResearchDesk />);
    fireEvent.click(screen.getByText('Live Run'));
    expect(await screen.findByText('Select a report first to view live telemetry.')).toBeTruthy();
  });

  // 2.11.0 QA (owner, 2026-11-01): the Reports tab showed the raw sources first and Hector's
  // answer at the bottom. A report with Hector's research leads with the answer.
  it("leads with Hector's answer, and keeps the raw source list folded away", async () => {
    (hectorResearchServiceModule as unknown as { __addReport: (r: Record<string, unknown>) => void }).__addReport({
      id: 'r1', researchQuestion: 'Top KDP niches?', status: 'research_done', confidenceLevel: 'inferred',
      sources: [{ url: 'https://rank.example/kdp', type: 'general', snippet: 'raw text' }],
      research: { question: 'Top KDP niches?', answer: 'Journals and planners sell best [1].', subQuestions: [], disagreements: [], notFound: [], rounds: 1, providers: [], sources: [{ n: 1, url: 'https://rank.example/kdp', title: 'Rank', kind: 'general', label: 'read', excerpt: '' }] },
    });
    render(<HectorResearchDesk />);
    fireEvent.click(screen.getByText('Reports'));
    expect(await screen.findByTestId('research-findings')).toBeTruthy();
    expect(screen.queryByText('Discovered Sources')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /every page hector looked at/i }));
    expect(screen.getByText('Discovered Sources')).toBeTruthy();
  });
});
