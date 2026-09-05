import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/browserAutomationService', () => ({ openExternalUrl: vi.fn() }));

const mockExportMarkdown = vi.fn();
const mockExportPdf = vi.fn().mockResolvedValue(undefined);
const mockExportPptx = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/hectorExportService', () => ({
  exportHectorReportAsMarkdown: (...args: unknown[]) => mockExportMarkdown(...args),
  exportHectorReportAsPdf: (...args: unknown[]) => mockExportPdf(...args),
  exportHectorReportAsPowerPoint: (...args: unknown[]) => mockExportPptx(...args)
}));

const mockResynthesize = vi.fn().mockResolvedValue({ synthesis: { overview: 'Retried.', keyFindings: [], disagreements: [], gaps: [] } });
vi.mock('../services/hectorResearchService', () => ({
  resynthesizeHectorReport: (...args: unknown[]) => mockResynthesize(...args)
}));

import { ResearchReportPanel } from '../components/hector/ResearchReportPanel';

const REPORT_WITH_SYNTHESIS = {
  id: 'report-1',
  researchQuestion: 'Test question',
  dateChecked: '2026-09-05T00:00:00.000Z',
  confidenceLevel: 'verified',
  status: 'sources_verified',
  synthesis: {
    overview: 'Overview text.',
    keyFindings: ['Finding one'],
    disagreements: ['Disagreement one'],
    gaps: ['Gap one']
  },
  sourceProofs: [{ url: 'https://a.example.com', ok: true, httpStatus: 200 }],
  recommendedNextStep: 'Review and proceed.'
};

const REPORT_WITHOUT_SYNTHESIS = {
  ...REPORT_WITH_SYNTHESIS,
  synthesis: undefined
};

describe('ResearchReportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the Structured view showing all four sections', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    expect(screen.getByText('Overview text.')).toBeTruthy();
    expect(screen.getByText('Finding one')).toBeTruthy();
    expect(screen.getByText('Disagreement one')).toBeTruthy();
    expect(screen.getByText('Gap one')).toBeTruthy();
  });

  it('Brief toggle shows only the overview', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Brief' }));
    expect(screen.getByText('Overview text.')).toBeTruthy();
    expect(screen.queryByText('Finding one')).toBeNull();
  });

  it('Medium toggle shows overview and key findings but not disagreements/gaps', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    expect(screen.getByText('Overview text.')).toBeTruthy();
    expect(screen.getByText('Finding one')).toBeTruthy();
    expect(screen.queryByText('Disagreement one')).toBeNull();
  });

  it('Source Proofs are collapsed by default behind a disclosure toggle', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    expect(screen.queryByText('https://a.example.com')).toBeNull();
    fireEvent.click(screen.getByText(/Sources \(1\)/));
    expect(screen.getByText('https://a.example.com')).toBeTruthy();
  });

  it('export row calls the export service functions', async () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(mockExportMarkdown).toHaveBeenCalledWith(REPORT_WITH_SYNTHESIS);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(mockExportPdf).toHaveBeenCalledWith(REPORT_WITH_SYNTHESIS);
    fireEvent.click(screen.getByRole('button', { name: 'PowerPoint' }));
    expect(mockExportPptx).toHaveBeenCalledWith(REPORT_WITH_SYNTHESIS);
  });

  it('export buttons are disabled when there is no synthesis', () => {
    render(<ResearchReportPanel report={REPORT_WITHOUT_SYNTHESIS} />);
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PowerPoint' })).toBeDisabled();
  });

  it('shows a Re-synthesize action when a source succeeded but synthesis is absent, and calls resynthesizeHectorReport', async () => {
    render(<ResearchReportPanel report={REPORT_WITHOUT_SYNTHESIS} />);
    const retryBtn = screen.getByRole('button', { name: /Re-synthesize/i });
    fireEvent.click(retryBtn);
    expect(mockResynthesize).toHaveBeenCalledWith('report-1');
  });

  it('does not show Re-synthesize when synthesis is already present', () => {
    render(<ResearchReportPanel report={REPORT_WITH_SYNTHESIS} />);
    expect(screen.queryByRole('button', { name: /Re-synthesize/i })).toBeNull();
  });
});
