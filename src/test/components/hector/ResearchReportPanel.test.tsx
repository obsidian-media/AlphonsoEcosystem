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

  it('shows the synthesis-gap honesty notice whenever a report is selected', () => {
    render(<ResearchReportPanel report={{ researchQuestion: 'Q', status: 'draft' }} />);
    expect(screen.getByText(/doesn't yet combine these into one written report/i)).toBeTruthy();
  });

  it('renders verified facts, inferred points, and approval-needed lists', () => {
    render(<ResearchReportPanel report={{
      researchQuestion: 'Q',
      status: 'complete',
      verifiedFacts: ['Fact A'],
      inferredPoints: ['Inference A'],
      joseApprovalNeeded: ['Approval A'],
      recommendedNextStep: 'Send to Jose',
    }} />);
    expect(screen.getByText('Fact A')).toBeTruthy();
    expect(screen.getByText('Inference A')).toBeTruthy();
    expect(screen.getByText('Approval A')).toBeTruthy();
    expect(screen.getByText(/Send to Jose/)).toBeTruthy();
  });
});
