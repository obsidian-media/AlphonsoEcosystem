// Research works the question in rounds and answers it (agent phase 1, owner 2026-10-25:
// "when I give a research task, I expect a proper result, not just a Google search").
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
const search = vi.fn();
const invoke = vi.fn();
vi.mock('../../../lib/ollama', async (orig) => ({ ...(await orig() as object), generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));
vi.mock('../../../services/hector/searchChain', () => ({ searchChain: (...a: unknown[]) => search(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { runResearch, fallbackQuery, parseWriteUp, reportText, planQuestion } from '../../../services/hector/researchRun';
import { HECTOR_LIMITS } from '../../../services/hector/researchLimits';

const json = (v: unknown) => ({ response: JSON.stringify(v) });
const found = (urls: string[]) => ({ sources: urls.map((url) => ({ url, title: `T ${url}`, snippet: `snippet of ${url}`, provider: 'duckduckgo', kind: url.includes('.gov') ? 'primary' : 'general' })), providers: ['duckduckgo'], errors: [] });
const PAGE = (topic: string) => `Europe has about 17 million managed honeybee colonies. ${topic} colonies decline because of the varroa mite and pesticides, the report says in detail. Beekeepers across the continent report heavier winter losses than a decade ago, and national surveys track them every year.`;
let fetched: string[] = [];

beforeEach(() => {
  llm.mockReset(); search.mockReset(); invoke.mockReset(); fetched = [];
  invoke.mockImplementation(async (cmd: string, args: any) => {
    if (cmd === 'fetch_research_sources') {
      return args.sources.map((s: { url: string }) => {
        fetched.push(s.url);
        if (s.url.includes('blocked')) return { url: s.url, ok: false, httpStatus: 403, snippet: 'Just a moment', pdf: false, title: null };
        return { url: s.url, ok: true, httpStatus: 200, snippet: PAGE(s.url), pdf: false, title: `Page ${s.url}` };
      });
    }
    return null;
  });
});

describe('fallbackQuery', () => {
  it("keeps the request's own words only", () => {
    expect(fallbackQuery('/jose Research how many honeybee colonies there are in Europe.\n\nIf you need something, end with HELP: x')).toBe('Research how many honeybee colonies there are in Europe.');
    expect(fallbackQuery('Ask Jose: research bees')).toBe('research bees');
    expect(fallbackQuery('x '.repeat(200)).length).toBeLessThanOrEqual(HECTOR_LIMITS.fallbackQueryChars);
  });
});

describe('planQuestion', () => {
  it('keeps at most 5 sub-questions of at most 3 short queries', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: Array.from({ length: 7 }, (_, i) => ({ question: `q${i}`, queries: ['a', 'b', 'c', 'd', 'x'.repeat(300)] })) }));
    const plan = await planQuestion('How many colonies?', 'How many colonies?');
    expect(plan).toHaveLength(5);
    expect(plan[0].queries).toHaveLength(3);
  });

  it('an unreadable answer gives one sub-question with the fallback query', async () => {
    llm.mockResolvedValueOnce({ response: 'I think we should search' });
    expect(await planQuestion('How many colonies?', '/jose How many colonies in Europe?')).toEqual([{ question: 'How many colonies?', queries: ['How many colonies in Europe?'] }]);
  });
});

describe('parseWriteUp', () => {
  it('drops a finding citing a source that does not exist, and computes support', () => {
    const kinds = ['primary', 'general', 'general'] as const;
    const parsed = parseWriteUp(JSON.stringify({
      answer: 'About 17 million.',
      subQuestions: [{ question: 'How many?', status: 'answered', findings: [
        { text: '17 million colonies', sources: [1, 2] },
        { text: 'A made-up figure', sources: [9] },
        { text: 'Varroa is a cause', sources: [3] },
        { text: 'Pesticides', sources: [1] },
      ] }],
      disagreements: [], notFound: [],
    }), [...kinds])!;
    const findings = parsed.subQuestions[0].findings;
    expect(findings.map((f) => f.text)).toEqual(['17 million colonies', 'Varroa is a cause', 'Pesticides']);
    expect(findings.map((f) => f.support)).toEqual(['several sources', 'one source, not primary', 'one source']);
  });

  it('an answer without "answer" is not a write-up', () => {
    expect(parseWriteUp('{"subQuestions": []}', [])).toBeNull();
  });
});

describe('runResearch', () => {
  const plan = json({ subQuestions: [{ question: 'How many colonies?', queries: ['honeybee colonies Europe number'] }, { question: 'Why declining?', queries: ['honeybee decline causes Europe'] }] });
  const writeUp = (status: string, followUp?: string, sources = [1]) => json({
    answer: 'Europe has about 17 million colonies; varroa and pesticides drive the decline.',
    subQuestions: [
      { question: 'How many colonies?', status: 'answered', findings: [{ text: 'About 17 million managed colonies', sources }] },
      { question: 'Why declining?', status, findings: [{ text: 'Varroa mite', sources }], ...(followUp ? { followUp } : {}) },
    ],
    disagreements: [], notFound: [],
  });

  it('no follow-up round when the first answers everything', async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(writeUp('answered'));
    search.mockResolvedValue(found(['https://a.example/x', 'https://www.usda.gov/y']));
    const out = await runResearch('How many colonies and why declining?', { large: false, reportId: 'hector-report-1-a' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.report.rounds).toBe(1);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(reportText(out.report).startsWith('Europe has about 17 million colonies')).toBe(true);
  });

  it('a follow-up round only for what is missing, never re-reading a source', async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(writeUp('partly', 'varroa losses Europe official statistics')).mockResolvedValueOnce(writeUp('answered', undefined, [1, 3]));
    search.mockResolvedValueOnce(found(['https://a.example/x', 'https://b.example/y'])).mockResolvedValueOnce(found(['https://a.example/x', 'https://c.example/z']));
    const out = await runResearch('How many colonies and why declining?', { large: false, reportId: 'hector-report-1-b' });
    expect(out.ok && out.report.rounds).toBe(2);
    expect(search.mock.calls[1][0]).toEqual(['varroa losses Europe official statistics']);
    expect(fetched.filter((u) => u === 'https://a.example/x')).toHaveLength(1);
  });

  it('stops after 2 follow-up rounds for a small model, 3 for a large one', async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValue(writeUp('open', 'another angle'));
    let n = 0;
    search.mockImplementation(async () => found([`https://s${n++}.example/a`]));
    const small = await runResearch('Q?', { large: false, reportId: 'hector-report-1-c' });
    expect(small.ok && small.report.rounds).toBe(1 + HECTOR_LIMITS.followUpRoundsSmall);
    llm.mockReset(); llm.mockResolvedValueOnce(plan).mockResolvedValue(writeUp('open', 'another angle'));
    const large = await runResearch('Q?', { large: true, reportId: 'hector-report-1-d' });
    expect(large.ok && large.report.rounds).toBe(1 + HECTOR_LIMITS.followUpRoundsLarge);
  });

  it('a blocked page keeps its search snippet, labelled', async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(writeUp('answered'));
    search.mockResolvedValue(found(['https://blocked.example/x', 'https://a.example/y']));
    const out = await runResearch('Q?', { large: false, reportId: 'hector-report-1-e' });
    if (!out.ok) throw new Error(String((out as { reason?: string }).reason));
    const blocked = out.report.sources.find((s) => s.url.includes('blocked'))!;
    expect(blocked.label).toBe('snippet');
    expect(blocked.excerpt).toBe('snippet of https://blocked.example/x');
    expect(reportText(out.report)).toMatch(/Snippet only/);
  });

  it('saves page text to files and keeps short excerpts', async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(writeUp('answered'));
    search.mockResolvedValue(found(['https://a.example/x']));
    const out = await runResearch('Q?', { large: false, reportId: 'hector-report-1-f' });
    if (!out.ok) throw new Error(String((out as { reason?: string }).reason));
    const save = invoke.mock.calls.find((c) => c[0] === 'research_save_pages')!;
    expect(save[1].reportId).toBe('hector-report-1-f');
    expect(save[1].pages[0]).toEqual({ n: 1, text: PAGE('https://a.example/x') });
    for (const s of out.report.sources) expect(s.excerpt.length).toBeLessThanOrEqual(HECTOR_LIMITS.excerptChars);
  });

  it('nothing found: no write-up from memory, the reason instead', async () => {
    llm.mockResolvedValueOnce(plan);
    search.mockResolvedValue({ sources: [], providers: ['duckduckgo'], errors: [] });
    const out = await runResearch('Q?', { large: false, reportId: 'hector-report-1-g' });
    expect(out).toEqual({ ok: false, reason: expect.stringMatching(/No search engine found anything/) });
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("the model can't write a usable report: it fails, with no stand-in", async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValue({ response: 'not json' });
    search.mockResolvedValue(found(['https://a.example/x']));
    expect(await runResearch('Q?', { large: false, reportId: 'hector-report-1-h' })).toEqual({ ok: false, reason: "Hector's model didn't write a usable report." });
  });

  it('reads at most 20 sources, supplied addresses first', async () => {
    llm.mockResolvedValueOnce(plan).mockResolvedValue(writeUp('open', 'more'));
    let n = 0;
    search.mockImplementation(async () => found(Array.from({ length: 8 }, () => `https://s${n++}.example/a`)));
    const out = await runResearch('Q?', { large: true, reportId: 'hector-report-1-i', urls: ['https://mine.example/report'] });
    expect(fetched[0]).toBe('https://mine.example/report');
    expect(new Set(fetched).size).toBeLessThanOrEqual(HECTOR_LIMITS.maxSourcesRead);
    expect(out.ok).toBe(true);
  });
});
