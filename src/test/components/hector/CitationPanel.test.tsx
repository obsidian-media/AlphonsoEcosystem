import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { CitationPanel } from '../../../components/hector/CitationPanel';

describe('CitationPanel', () => {
  it('shows the "Citations" label and empty-state copy when there is nothing to cite', () => {
    render(<CitationPanel report={null} />);
    expect(screen.getByText('Citations')).toBeTruthy();
    expect(screen.getByText('Citation list is empty because this report has not completed a live run yet.')).toBeTruthy();
  });

  it('renders numbered citations from sourceProofs, with the subhead shown', () => {
    render(<CitationPanel report={{ sourceProofs: [{ url: 'https://a.com', verificationState: 'verified', httpStatus: 200 }] }} />);
    expect(screen.getByText(/\[1\]/)).toBeTruthy();
    expect(screen.getByText('https://a.com')).toBeTruthy();
    expect(screen.getByText("Numbered bibliography for this report's approval handoff.")).toBeTruthy();
  });

  it('falls back to report.urls when sourceProofs is absent', () => {
    render(<CitationPanel report={{ urls: ['https://b.com'] }} />);
    expect(screen.getByText('https://b.com')).toBeTruthy();
  });
});
