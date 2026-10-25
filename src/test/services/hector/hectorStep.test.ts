// Hector's step hands on a cited report; reports stay small (agent phase 1, 2026-10-25).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const research = vi.fn();
const invoke = vi.fn(async () => null);
const pushMemory = vi.fn();
vi.mock('../../../services/hector/researchRun', async (orig) => ({ ...(await orig() as object), runResearch: (...a: unknown[]) => research(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...(a as [])) }));
vi.mock('../../../services/memoryService', () => ({ pushMemoryItem: (...a: unknown[]) => pushMemory(...a) }));
vi.mock('../../../services/memoryGraphService', () => ({ addNode: vi.fn(async () => null), addEdge: vi.fn(async () => null) }));

import { runHectorStep } from '../../../services/hector/hectorStep';
import { createResearchDraft, listHectorReports, runHectorLiveResearch, slimOldReports } from '../../../services/hectorResearchService';
import type { ResearchReport } from '../../../services/hector/researchRun';
import { HECTOR_LIMITS } from '../../../services/hector/researchLimits';

const REPORT: ResearchReport = {
  question: 'How many honeybee colonies are in Europe?',
  answer: 'Europe has about 17 million managed honeybee colonies.',
  subQuestions: [{ question: 'How many?', status: 'answered', findings: [{ text: 'About 17 million managed colonies', sources: [1, 2], support: 'several sources' }] }],
  disagreements: [], notFound: [],
  sources: [
    { n: 1, title: 'EU report', url: 'https://ec.europa.eu/bees', kind: 'primary', label: 'read', excerpt: 'Europe has about 17 million colonies.' },
    { n: 2, title: 'News', url: 'https://news.example/2026/01/02/bees', kind: 'news', label: 'snippet', reason: 'blocked (HTTP 403)', excerpt: 'About 17 million…' },
  ],
  rounds: 1, providers: ['duckduckgo'],
};

const step = { agent: 'hector', actionType: 'research_report', stepId: 'research', instruction: 'Find the facts and sources for the question, with citations.' };
const input = (request: string) => ({ instruction: step.instruction, request, needs: [], others: [], memory: '', review: null });

beforeEach(() => { localStorage.clear(); research.mockReset(); invoke.mockClear(); pushMemory.mockClear(); });

describe("Hector's step", () => {
  it('hands on the answer first, cited findings and numbered sources', async () => {
    research.mockResolvedValue({ ok: true, report: REPORT });
    const out: any = await runHectorStep(step, input('/jose How many honeybee colonies are in Europe?'), { large: false });
    expect(out.resultState).toBe('completed');
    expect(out.summary.startsWith('Europe has about 17 million managed honeybee colonies.')).toBe(true);
    expect(out.summary).toContain('About 17 million managed colonies [1][2] (several sources)');
    expect(out.summary).toContain('[2] News — https://news.example/2026/01/02/bees (Snippet only: blocked (HTTP 403))');
    expect(out.schema.answer).toBe(REPORT.answer);
    expect(out.sources).toEqual(['https://ec.europa.eu/bees', 'https://news.example/2026/01/02/bees']);
  });

  it("searches with the request's own words, never Jose's notes or the HELP line", async () => {
    research.mockResolvedValue({ ok: true, report: REPORT });
    await runHectorStep(step, input('/jose How many honeybee colonies are in Europe?\n\nIf you need something, end with HELP: x'), { large: false });
    const [question, opts] = research.mock.calls[0];
    expect(question).toBe('How many honeybee colonies are in Europe?');
    expect(question).not.toMatch(/HELP|Find the facts/);
    expect(opts.focus).toBe(step.instruction);
  });

  it('nothing found: the step waits for setup with the reason', async () => {
    research.mockResolvedValue({ ok: false, reason: 'No search engine found anything for "bees". Add a search key in Settings → Connectors → Search & Research, or rephrase the question.' });
    const out: any = await runHectorStep(step, input('bees'), { large: false });
    expect(out.resultState).toBe('setup_required');
    expect(out.summary).toMatch(/Add a search key/);
  });

  it("the model can't write a report: the step fails", async () => {
    research.mockResolvedValue({ ok: false, reason: "Hector's model didn't write a usable report." });
    expect(((await runHectorStep(step, input('bees'), { large: false })) as any).resultState).toBe('failed');
  });
});

describe('reports stay small', () => {
  it('a draft saves no memory note; a finished report saves one', async () => {
    const draft = createResearchDraft({ researchQuestion: 'Bees?' });
    expect(pushMemory).not.toHaveBeenCalled();
    research.mockResolvedValue({ ok: true, report: REPORT });
    await runHectorLiveResearch(draft.id);
    expect(pushMemory).toHaveBeenCalledTimes(1);
    expect(pushMemory.mock.calls[0][0].title).toBe('Hector research: Bees?');
  });

  it('keeps the newest reports and deletes the dropped ones\' page files', () => {
    for (let i = 0; i < HECTOR_LIMITS.maxReports + 2; i += 1) createResearchDraft({ researchQuestion: `Q${i}` });
    expect(listHectorReports()).toHaveLength(HECTOR_LIMITS.maxReports);
    expect(invoke.mock.calls.filter((c: any[]) => c[0] === 'research_delete')).toHaveLength(2);
  });

  it('slims an old report once: long page text to a file, a short excerpt kept', async () => {
    const draft = createResearchDraft({ researchQuestion: 'Old' });
    const rows = JSON.parse(localStorage.getItem('alphonso_hector_reports_v1')!);
    rows[0].sources = [{ url: 'https://phys.org/x.pdf', snippet: 'x'.repeat(98000) }];
    localStorage.setItem('alphonso_hector_reports_v1', JSON.stringify(rows));
    await slimOldReports();
    const saved = invoke.mock.calls.find((c: any[]) => c[0] === 'research_save_pages') as any;
    expect(saved[1]).toEqual({ reportId: draft.id, pages: [{ n: 1, text: 'x'.repeat(98000) }] });
    expect(listHectorReports()[0].sources[0].snippet.length).toBeLessThanOrEqual(HECTOR_LIMITS.excerptChars);
    invoke.mockClear();
    await slimOldReports();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('the memory graph', () => {
  it('a finished report writes its node and cites each source', async () => {
    const graph = await import('../../../services/memoryGraphService');
    vi.mocked(graph.addNode).mockClear();
    vi.mocked(graph.addNode).mockResolvedValue('node-1' as never);
    const draft = createResearchDraft({ researchQuestion: 'Bees?' });
    expect(graph.addNode).not.toHaveBeenCalled();
    research.mockResolvedValue({ ok: true, report: REPORT });
    await runHectorLiveResearch(draft.id);
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(graph.addNode).mock.calls.map((c) => c[0])).toEqual(['research_report', 'source', 'source']);
    expect(graph.addEdge).toHaveBeenCalledWith('node-1', 'node-1', 'cites', expect.objectContaining({ createdBy: 'hector' }));
  });
});

describe('research briefs (Project Execution)', () => {
  it('return the answer, the cited text and the numbered sources', async () => {
    const { createResearchBrief } = await import('../../../services/hectorResearchService');
    research.mockResolvedValue({ ok: true, report: REPORT });
    const brief: any = await createResearchBrief('How many honeybee colonies are in Europe?');
    expect(brief.summary).toBe(REPORT.answer);
    expect(brief.text).toContain('[1] EU report — https://ec.europa.eu/bees (Read)');
    expect(brief.verifiedFacts).toEqual(['About 17 million managed colonies [1][2]']);
    expect(brief.sources.map((s: { url: string }) => s.url)).toEqual(['https://ec.europa.eu/bees', 'https://news.example/2026/01/02/bees']);
  });

  it('say why when nothing was found', async () => {
    const { createResearchBrief } = await import('../../../services/hectorResearchService');
    research.mockResolvedValue({ ok: false, reason: 'No search engine found anything for "x".' });
    const brief: any = await createResearchBrief('x');
    expect(brief.status).toBe('research_failed');
    expect(brief.summary).toBe('No search engine found anything for "x".');
  });
});
