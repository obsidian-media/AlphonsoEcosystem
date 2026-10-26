import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../services/jose/joseStepOutputs', () => ({ getStepOutput: vi.fn() }));
vi.mock('../../../services/browserAutomationService', () => ({ openSourceLink: vi.fn() }));

import { getStepOutput } from '../../../services/jose/joseStepOutputs';
import { openSourceLink } from '../../../services/browserAutomationService';
import { JoseStepOutput } from '../../../components/jose/JoseStepOutput';

beforeEach(() => vi.clearAllMocks());

// Phase 6a (QA Bug 4): the board shows what an executed step produced.
describe('JoseStepOutput', () => {
  it('shows the summary, the files written and the sources', () => {
    vi.mocked(getStepOutput).mockReturnValueOnce({
      stepId: 'alphonso', agent: 'alphonso', storedAtMs: 1,
      summary: 'Wrote the landing page.',
      artifacts: [{ type: 'file_write', path: 'site/index.html' }, { type: 'note' }, { type: 'file_write', relativePath: 'site\\style.css' }],
      sources: [{ title: 'IANA example domains', url: 'https://www.iana.org/help/example-domains' }],
    } as never);
    render(<JoseStepOutput commandId="c1" stepId="alphonso" />);
    expect(getStepOutput).toHaveBeenCalledWith('c1', 'alphonso');
    expect(screen.getByText('Wrote the landing page.')).toBeTruthy();
    expect(screen.getByText('index.html')).toBeTruthy();
    expect(screen.getByText('style.css')).toBeTruthy();
    // In the app window a link opens through the backend (open_url), not target="_blank".
    fireEvent.click(screen.getByRole('button', { name: 'IANA example domains' }));
    expect(openSourceLink).toHaveBeenCalledWith('https://www.iana.org/help/example-domains');
  });

  it("shows a step's structured result as text, cut at 2,000 characters with Show all", () => {
    const long = 'x'.repeat(2500);
    vi.mocked(getStepOutput).mockReturnValueOnce({ stepId: 'maria', agent: 'maria', storedAtMs: 1, summary: 'Reviewed.', schema: { summary: long } } as never);
    render(<JoseStepOutput commandId="c1" stepId="maria" />);
    const text = screen.getByTestId('jose-step-output-text');
    expect(text.textContent!.length).toBeLessThan(2100);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByTestId('jose-step-output-text').textContent).toContain(long);
  });

  it('says when nothing was saved for the step', () => {
    vi.mocked(getStepOutput).mockReturnValueOnce(null);
    render(<JoseStepOutput commandId="c1" stepId="miya" />);
    expect(screen.getByText('Nothing was saved for this step.')).toBeTruthy();
  });
});

describe("Hector's research on the board (agent phase 1)", () => {
  it('shows the cited report with labelled sources and Save source', () => {
    vi.mocked(getStepOutput).mockReturnValue({
      summary: 'Europe has about 17 million colonies.\n\nSources:\n[1] EU — https://ec.europa.eu/bees (Read)',
      sources: ['https://ec.europa.eu/bees'],
      schema: {
        question: 'Bees?', answer: 'Europe has about 17 million colonies.', rounds: 1, providers: [], disagreements: [], notFound: [],
        subQuestions: [{ question: 'How many?', status: 'answered', findings: [{ text: 'About 17 million', sources: [1], support: 'one source' }] }],
        sources: [{ n: 1, title: 'EU', url: 'https://ec.europa.eu/bees', kind: 'primary', label: 'read', excerpt: '' }],
      },
    } as never);
    render(<JoseStepOutput commandId="c-research" stepId="research" />);
    expect(screen.getByTestId('research-findings').textContent).toContain('About 17 million');
    expect(screen.getByRole('button', { name: 'Save source' })).toBeTruthy();
    expect(screen.queryByTestId('jose-step-output-text')).toBeNull();
  });
});
