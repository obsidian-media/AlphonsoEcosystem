// Agent phase 4: a disguised (or Web Risk-listed) source link warns before it opens.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const invoke = vi.fn(async () => ({ opened: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invoke(...a) }));
vi.mock('../../services/sentinel/webRisk', () => ({ checkLinksWithWebRisk: async () => new Map() }));

import { openSourceLink, setLinkConfirmHandler } from '../../services/browserAutomationService';
import { LinkWarningHost } from '../../components/sentinel/LinkWarning';

beforeEach(() => { invoke.mockClear(); setLinkConfirmHandler(null); });

describe('openSourceLink', () => {
  it('a normal link opens at once', async () => {
    const confirm = vi.fn(async () => true);
    setLinkConfirmHandler(confirm);
    expect(await openSourceLink('https://www.goodnotes.com/blog/x')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://www.goodnotes.com/blog/x' });
  });

  it('a disguised link asks, and Cancel opens nothing', async () => {
    const confirm = vi.fn(async () => false);
    setLinkConfirmHandler(confirm);
    expect(await openSourceLink('http://paypa1-secure-login.com/verify')).toBe(false);
    expect(confirm.mock.calls[0][0]).toMatch(/digits in place of letters/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('Open anyway opens it', async () => {
    setLinkConfirmHandler(async () => true);
    expect(await openSourceLink('http://paypa1-secure-login.com/verify')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'http://paypa1-secure-login.com/verify' });
  });

  it('with no window to ask in, a disguised link does not open', async () => {
    expect(await openSourceLink('http://paypa1-secure-login.com/verify')).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('LinkWarningHost', () => {
  it('shows the reason with Open anyway and Cancel', async () => {
    render(<LinkWarningHost />);
    let opened;
    await act(async () => { opened = openSourceLink('https://185.23.4.9/login'); });
    expect(await screen.findByText(/a bare IP address/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open anyway' }));
    expect(await opened).toBe(true);
    await waitFor(() => expect(screen.queryByText(/a bare IP address/)).toBeNull());
  });
});

describe('every source link', () => {
  it('uses openSourceLink', () => {
    for (const f of ['hector/CitationPanel', 'hector/ResearchFindings', 'hector/ResearchReportPanel', 'hector/SavedSources', 'hector/SourceBoard', 'jose/JoseStepOutput']) {
      const src = readFileSync(`src/components/${f}.tsx`, 'utf8');
      expect(src, f).toContain('openSourceLink(');
      expect(src, f).not.toContain('openExternalUrl(');
    }
  });
});
