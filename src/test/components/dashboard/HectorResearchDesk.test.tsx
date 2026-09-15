import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/hectorResearchService', () => {
  let reports: Record<string, unknown>[] = [];
  return {
    __resetReports: () => { reports = []; },
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
vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { HectorResearchDesk } from '../../../components/dashboard/HectorResearchDesk';
import * as hectorResearchServiceModule from '../../../services/hectorResearchService';

describe('HectorResearchDesk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hectorResearchServiceModule as unknown as { __resetReports: () => void }).__resetReports();
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
});
