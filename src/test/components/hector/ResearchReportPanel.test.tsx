import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { ResearchReportPanel } from '../../../components/hector/ResearchReportPanel';

describe('ResearchReportPanel', () => {
  it('shows the "no report selected" state when report is null', () => {
    render(<ResearchReportPanel report={null} />);
    expect(screen.getByText('No Hector report selected.')).toBeTruthy();
  });

  it('shows the source-discovery status and disabled export buttons when a report has no synthesis yet', () => {
    render(<ResearchReportPanel report={{ researchQuestion: 'Q', status: 'draft' }} />);
    expect(screen.getByText(/draft\. Sources and citations are generated from real live discovery\/fetch runs\./i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeDisabled();
  });

  it('renders approval-needed and recommended-next-step, once verifiedFacts/inferredPoints were superseded by real synthesis', () => {
    render(<ResearchReportPanel report={{
      researchQuestion: 'Q',
      status: 'complete',
      joseApprovalNeeded: ['Approval A'],
      recommendedNextStep: 'Send to Jose',
    }} />);
    expect(screen.getByText('Approval A')).toBeTruthy();
    expect(screen.getByText(/Send to Jose/)).toBeTruthy();
  });
});
