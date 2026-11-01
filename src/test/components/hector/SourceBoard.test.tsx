import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/browserAutomationService', () => ({
  openSourceLink: vi.fn(),
}));

import { openSourceLink } from '../../../services/browserAutomationService';
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

  it('clicking a source url calls openSourceLink with that url', () => {
    render(<SourceBoard report={{ sources: [{ url: 'https://example.com' }] }} />);
    fireEvent.click(screen.getByText('https://example.com'));
    expect(openSourceLink).toHaveBeenCalledWith('https://example.com');
  });

  // 2.11.0 QA (owner, 2026-11-01): reports saved before the fix hold compressed bytes as a page's
  // text; the list showed them as garbage and "general | | not fetched | expires n/a".
  it("says a page couldn't be read instead of showing its bytes, in plain words", () => {
    const garbage = '\u001F\uFFFD\u0008\u0000\uFFFD\uFFFDtj\uFFFD@ E\uFFFD\uFFFD e6\uFFFD \uFFFD\uFFFDE\uFFFDIgf';
    render(<SourceBoard report={{ sources: [
      { url: 'https://amazon.example/best', type: 'general', snippet: garbage },
      { url: 'https://rank.example/kdp', type: 'general', httpStatus: 200, verificationState: 'verified', snippet: 'The 10 best-selling KDP books.' },
    ] }} />);
    expect(screen.queryByText(garbage)).toBeNull();
    expect(screen.getByText("Couldn't read this page.")).toBeTruthy();
    expect(screen.getByText('The 10 best-selling KDP books.')).toBeTruthy();
    expect(screen.queryByText(/expires n\/a/)).toBeNull();
  });
});
