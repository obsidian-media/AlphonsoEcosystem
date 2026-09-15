import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openExternalUrl: vi.fn(),
}));

import { openExternalUrl } from '../../../services/browserAutomationService';
import { SourceBoard } from '../../../components/hector/SourceBoard';

describe('SourceBoard', () => {
  it('shows the "Discovered Sources" label and empty-state copy when there are no sources', () => {
    render(<SourceBoard report={null} />);
    expect(screen.getByText('Discovered Sources')).toBeTruthy();
    expect(screen.getByText('No sources recorded. Hector will not invent citations.')).toBeTruthy();
  });

  it('renders a source row with its url/type/verification state', () => {
    render(<SourceBoard report={{ sources: [{ url: 'https://example.com', type: 'official_docs', verificationState: 'verified', httpStatus: 200 }] }} />);
    expect(screen.getByText('https://example.com')).toBeTruthy();
    expect(screen.getByText(/official_docs.*verified.*HTTP 200/)).toBeTruthy();
  });

  it('clicking a source url calls openExternalUrl with that url', () => {
    render(<SourceBoard report={{ sources: [{ url: 'https://example.com' }] }} />);
    fireEvent.click(screen.getByText('https://example.com'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com');
  });
});
