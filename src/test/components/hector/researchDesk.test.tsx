// The Research Desk asks through Jose; reports show the answer first with citations (agent phase 1).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const submit = vi.fn(async () => ({ ok: true, commandId: 'c1' }));
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: (...a: unknown[]) => submit(...(a as [])) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
const openUrl = vi.fn();
vi.mock('../../../services/browserAutomationService', () => ({ openExternalUrl: (...a: unknown[]) => openUrl(...a), writeClipboard: vi.fn(async () => null) }));

import { askOnResearchDesk, DESK_LABEL } from '../../../services/hector/deskRequest';
import { ResearchFindings } from '../../../components/hector/ResearchFindings';
import { SavedSources } from '../../../components/hector/SavedSources';
import { HectorResearchDesk } from '../../../components/dashboard/HectorResearchDesk';
import { createResearchDraft } from '../../../services/hectorResearchService';
import { getBookmarks } from '../../../services/hectorBookmarkService';
import { buildHectorReportMarkdown } from '../../../services/hectorExportService';
import type { ResearchReport } from '../../../services/hector/researchRun';

const RESEARCH: ResearchReport = {
  question: 'How many honeybee colonies are in Europe?',
  answer: 'Europe has about 17 million managed honeybee colonies.',
  subQuestions: [{ question: 'How many?', status: 'answered', findings: [{ text: 'About 17 million managed colonies', sources: [1, 2], support: 'several sources' }] }],
  disagreements: ['EU says 17 million [1]; a blog says 20 million [2]'], notFound: ['Wild colony numbers'],
  sources: [
    { n: 1, title: 'EU report', url: 'https://ec.europa.eu/bees', kind: 'primary', label: 'read', excerpt: 'Europe has about 17 million colonies.' },
    { n: 2, title: 'Bee blog', url: 'https://blog.example/bees', kind: 'general', label: 'snippet', reason: 'blocked (HTTP 403)', excerpt: '20 million…' },
  ],
  rounds: 2, providers: ['duckduckgo'],
};

beforeEach(() => { localStorage.clear(); submit.mockClear(); openUrl.mockClear(); });

describe('askOnResearchDesk', () => {
  it('submits one Hector research step for the Desk report, through Jose', async () => {
    const draft = createResearchDraft({ researchQuestion: 'Bees?', sourceUrls: ['https://mine.example/report'] });
    await askOnResearchDesk(draft.id);
    const input: any = (submit.mock.calls[0] as any)[0];
    expect(input.label).toBe(DESK_LABEL);
    expect(input.source).toBe('research_desk');
    expect(input.text).toBe('Bees?');
    expect(input.steps).toEqual([expect.objectContaining({ agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], payload: { reportId: draft.id } })]);
  });
});

describe('ResearchFindings', () => {
  it('shows the answer first, cited findings, disagreements, what was not found and labelled sources', () => {
    render(<ResearchFindings research={RESEARCH} />);
    const text = screen.getByTestId('research-findings').textContent || '';
    expect(text.indexOf('Europe has about 17 million managed honeybee colonies.')).toBe(text.indexOf('Europe'));
    expect(text).toContain('About 17 million managed colonies');
    expect(text).toContain('several sources');
    expect(text).toContain('Wild colony numbers');
    expect(text).toContain('Snippet only: blocked (HTTP 403)');
    fireEvent.click(screen.getAllByRole('button', { name: '[2]' })[0]);
    expect(openUrl).toHaveBeenCalledWith('https://blog.example/bees');
  });

  it('Save source saves a bookmark', () => {
    render(<ResearchFindings research={RESEARCH} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save source' })[0]);
    expect(getBookmarks().map((b) => b.url)).toEqual(['https://ec.europa.eu/bees']);
  });
});

describe('SavedSources', () => {
  it('lists saved sources and removes one', async () => {
    render(<ResearchFindings research={RESEARCH} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Save source' })[1]);
    render(<SavedSources />);
    expect(screen.getByTestId('saved-sources').textContent).toContain('Bee blog');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(getBookmarks()).toEqual([]));
  });
});

describe('the export', () => {
  it('has the answer, numbered citations and labelled sources', () => {
    const md = buildHectorReportMarkdown({ researchQuestion: 'Bees?', status: 'research_done', research: RESEARCH } as never);
    expect(md).toContain('## Answer');
    expect(md).toContain('- About 17 million managed colonies [1][2] (several sources)');
    expect(md).toContain('[2] Bee blog — https://blog.example/bees (Snippet only: blocked (HTTP 403))');
  });
});

describe('the Research Desk', () => {
  it('runs through Jose and has one export', async () => {
    createResearchDraft({ researchQuestion: 'Bees?' });
    render(<HectorResearchDesk />);
    fireEvent.click(screen.getByRole('button', { name: /Reports/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run Live Research' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /^Export$/ })).toBeNull();
    expect(screen.queryByText(/Hand off to Jose/i)).toBeNull();
  });
});
