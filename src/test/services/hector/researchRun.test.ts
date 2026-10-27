// Research works the question in rounds and answers it (agent phase 1, owner 2026-10-25:
// "when I give a research task, I expect a proper result, not just a Google search").
import { describe, it, expect, vi, beforeEach } from 'vitest';

const llm = vi.fn();
const search = vi.fn();
const invoke = vi.fn();
vi.mock('../../../lib/ollama', async (orig) => ({ ...(await orig() as object), generateAgentLlmResponse: (...a: unknown[]) => llm(...a) }));
vi.mock('../../../services/hector/searchChain', () => ({ searchChain: (...a: unknown[]) => search(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const webRisk = vi.fn(async (): Promise<Map<string, string>> => new Map());
vi.mock('../../../services/sentinel/webRisk', () => ({ checkLinksWithWebRisk: (...a: unknown[]) => webRisk(...(a as [])) }));

import { runResearch, fallbackQuery, parseWriteUp, reportText, planQuestion } from '../../../services/hector/researchRun';
import { HECTOR_LIMITS } from '../../../services/hector/researchLimits';

const json = (v: unknown) => ({ response: JSON.stringify(v) });
const found = (urls: string[]) => ({ sources: urls.map((url) => ({ url, title: `T ${url} honeybee colonies declining losses`, snippet: `snippet of ${url}`, provider: 'duckduckgo', kind: url.includes('.gov') ? 'primary' : 'general' })), providers: ['duckduckgo'], errors: [] });
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

  // Agent roles Part C2: his write-up follows his skill; his searches stay the request's own words.
  it("puts his skill's instructions in the write-up, not in the searches", async () => {
    const skill = 'Your skill: Compare products and prices\nPut the options side by side, each price with its source and date.';
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(writeUp('answered'));
    search.mockResolvedValue(found(['https://a.example/x', 'https://www.usda.gov/y']));
    await runResearch('How many colonies and why declining?', { large: false, reportId: 'hector-report-1-s', skill });
    const writeUpPrompt = String(llm.mock.calls[1][1].prompt);
    expect(writeUpPrompt).toContain('Put the options side by side, each price with its source and date.');
    expect(writeUpPrompt.indexOf('Your skill:')).toBeLessThan(writeUpPrompt.indexOf('Question:'));
    for (const call of search.mock.calls) expect(String(call[0])).not.toContain('side by side');
  });

  // Agent roles Part C2: a result must share more than one word with the question to be read.
  it('reads only results that share at least two words with the question', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'Solar panel battery storage costs', queries: ['solar battery storage cost'] }] }))
      .mockResolvedValueOnce(writeUp('answered'));
    search.mockResolvedValue({ sources: [
      { url: 'https://living.example/costs', title: 'Costs of living', snippet: 'Rent and food prices', provider: 'duckduckgo', kind: 'general' },
      { url: 'https://energy.example/solar', title: 'Solar battery storage guide', snippet: 'What home batteries cost', provider: 'duckduckgo', kind: 'general' },
    ], providers: ['duckduckgo'], errors: [] });
    await runResearch('Solar panel battery storage costs', { large: false, reportId: 'hector-report-1-t' });
    expect(fetched).toContain('https://energy.example/solar');
    expect(fetched).not.toContain('https://living.example/costs');
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

  // Agent roles Part C2: a PDF whose text the backend read is read like a page.
  it("reads a PDF's text when the backend could, else keeps its snippet and says why", async () => {
    invoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd !== 'fetch_research_sources') return null;
      return args.sources.map((s: { url: string }) => s.url.includes('read.pdf')
        ? { url: s.url, ok: true, httpStatus: 200, pdf: true, pdfTextRead: true, snippet: PAGE(s.url), title: null }
        : { url: s.url, ok: true, httpStatus: 200, pdf: true, pdfTextRead: false, snippet: null, title: null });
    });
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(writeUp('answered'));
    search.mockResolvedValue(found(['https://a.example/read.pdf', 'https://b.example/scan.pdf']));
    const out = await runResearch('Q?', { large: false, reportId: 'hector-report-1-p' });
    if (!out.ok) throw new Error(String((out as { reason?: string }).reason));
    expect(out.report.sources.find((s) => s.url.includes('read.pdf'))!.label).toBe('read');
    const scanned = out.report.sources.find((s) => s.url.includes('scan.pdf'))!;
    expect(scanned.label).toBe('snippet');
    expect(scanned.reason).toBe("couldn't read the PDF's text");
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

describe('only sources about the question (agent phase 1 review)', () => {
  const plan = json({ subQuestions: [{ question: 'How many honeybee colonies in Europe?', queries: ['honeybee colonies Europe'] }] });
  const answered = json({ answer: 'About 17 million.', subQuestions: [{ question: 'How many honeybee colonies in Europe?', status: 'answered', findings: [{ text: '17 million colonies', sources: [1] }] }], disagreements: [], notFound: [] });

  it('drops a page that is not about the question, before and after reading', async () => {
    invoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd !== 'fetch_research_sources') return null;
      return args.sources.map((s: { url: string }) => ({
        url: s.url, ok: true, httpStatus: 200, pdf: false, title: null,
        snippet: s.url.includes('roi')
          ? 'Automation ROI: a developer guide to replacing manual processes with scripts, measuring time saved and cost per task across many teams in a company.'
          : PAGE(s.url),
      }));
    });
    llm.mockResolvedValueOnce(plan).mockResolvedValueOnce(answered);
    search.mockResolvedValue({ sources: [
      { url: 'https://bees.example/colonies', title: 'Honeybee colonies in Europe', snippet: 'colonies', provider: 'duckduckgo', kind: 'general' },
      { url: 'https://dev.example/roi', title: 'Automation ROI', snippet: 'replacing manual processes', provider: 'duckduckgo', kind: 'general' },
      { url: 'https://news.example/2026/10/23/phone-review', title: 'Phone review', snippet: 'a tablet phone', provider: 'news feeds', kind: 'news' },
    ], providers: ['duckduckgo'], errors: [] });
    const out = await runResearch('How many honeybee colonies are in Europe?', { large: false, reportId: 'hector-report-9-a' });
    if (!out.ok) throw new Error(String((out as { reason?: string }).reason));
    expect(out.report.sources.map((s) => s.url)).toEqual(['https://bees.example/colonies']);
    expect(fetched).not.toContain('https://news.example/2026/10/23/phone-review');
  });

  it('keeps a page you supplied even when it is short', async () => {
    invoke.mockImplementation(async (cmd: string, args: any) => (cmd === 'fetch_research_sources'
      ? args.sources.map((s: { url: string }) => ({ url: s.url, ok: true, httpStatus: 200, pdf: false, title: 'Example Domain', snippet: 'Example Domain. This domain is for use in illustrative examples in documents.' }))
      : null));
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'What is the example domain for?', queries: ['example domain'] }] }))
      .mockResolvedValueOnce(json({ answer: 'It is for examples in documents.', subQuestions: [{ question: 'What is the example domain for?', status: 'answered', findings: [{ text: 'For illustrative examples in documents', sources: [1] }] }], disagreements: [], notFound: [] }));
    search.mockResolvedValue({ sources: [], providers: ['duckduckgo'], errors: [] });
    const out = await runResearch('What is the IANA example domain used for?', { large: false, reportId: 'hector-report-9-b', urls: ['https://example.com/'] });
    if (!out.ok) throw new Error(String((out as { reason?: string }).reason));
    expect(out.report.sources[0]).toMatchObject({ url: 'https://example.com/', label: 'read' });
  });

  it('a part with no findings is open, so a follow-up round runs', async () => {
    llm.mockResolvedValueOnce(plan)
      .mockResolvedValueOnce(json({ answer: 'Not in the sources.', subQuestions: [{ question: 'How many honeybee colonies in Europe?', status: 'answered', findings: [], followUp: 'EU beehives statistics Eurostat' }], disagreements: [], notFound: [] }))
      .mockResolvedValueOnce(answered);
    let n = 0;
    search.mockImplementation(async () => found([`https://s${n++}.example/honeybee-colonies`]));
    const out = await runResearch('How many honeybee colonies are in Europe?', { large: false, reportId: 'hector-report-9-c' });
    expect(out.ok && out.report.rounds).toBe(2);
    expect(search.mock.calls[1][0]).toEqual(['EU beehives statistics Eurostat']);
  });
});

describe('a refused free search is said plainly', () => {
  it('names the refusal and the way out, not "rephrase"', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'Bees?', queries: ['bees'] }] }));
    search.mockResolvedValue({ sources: [], providers: ['duckduckgo'], errors: ['duckduckgo: The free search (DuckDuckGo) refused: too many searches from this computer. Try again later, or add a search key'] });
    const out = await runResearch('Bees?', { large: false, reportId: 'hector-report-9-d' });
    expect(out).toEqual({ ok: false, reason: 'The free search (DuckDuckGo) refused: too many searches from this computer. Try again later, or add a search key in Settings → Connectors → Search & Research.' });
  });
});

describe('a part is answered only by a page read or a primary source', () => {
  it('a part resting on a snippet of an ordinary page gets a follow-up round', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many colonies?', queries: ['eu honeybee colonies'] }] }));
    search.mockResolvedValueOnce(found(['https://social.example/blocked-post'])).mockResolvedValueOnce(found(['https://stats.example.gov/bees']));
    const writeUp = (n: number) => json({ answer: 'About 9.4 million.', subQuestions: [{ question: 'How many colonies?', status: 'answered', findings: [{ text: 'About 9.4 million', sources: [n] }] }] });
    llm.mockResolvedValueOnce(writeUp(1)).mockResolvedValueOnce(writeUp(2));
    const out = await runResearch('How many colonies?', { large: false, reportId: 'hector-report-9-e' });
    expect(out.ok).toBe(true);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1][0]).toEqual(['How many colonies?']);
    if (out.ok) expect(out.report.rounds).toBe(2);
  });
});

describe('planQuestion drops a repeated part', () => {
  it('keeps each question once', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'Causes of losses?', queries: ['a'] }, { question: 'How many?', queries: ['b'] }, { question: 'causes of losses? ', queries: ['c'] }] }));
    expect((await planQuestion('Q', 'Q')).map((p) => p.question)).toEqual(['Causes of losses?', 'How many?']);
  });
});

describe('a snippet is never enough, and no planned part is lost', () => {
  it('a primary source known only by its snippet still gets a follow-up', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many colonies?', queries: ['eu honeybee colonies'] }] }));
    search.mockResolvedValueOnce(found(['https://stats.example.gov/blocked'])).mockResolvedValueOnce(found(['https://other.example.org/bees']));
    const writeUp = (n: number) => json({ answer: 'About 17 million.', subQuestions: [{ question: 'How many colonies?', status: 'answered', findings: [{ text: 'About 17 million', sources: [n] }] }] });
    llm.mockResolvedValueOnce(writeUp(1)).mockResolvedValueOnce(writeUp(2));
    const out = await runResearch('How many colonies?', { large: false, reportId: 'hector-report-9-f' });
    expect(search).toHaveBeenCalledTimes(2);
    if (out.ok) expect(out.report.rounds).toBe(2);
  });

  it('a planned part the write-up left out comes back as open, searched again', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many colonies?', queries: ['eu colonies count'] }, { question: 'Causes of losses?', queries: ['honeybee colony losses causes'] }] }));
    search.mockResolvedValueOnce(found(['https://a.example.org/honeybee'])).mockResolvedValueOnce(found(['https://b.example.org/honeybee']));
    llm.mockResolvedValueOnce(json({ answer: 'Varroa and pesticides.', subQuestions: [{ question: 'Causes of losses?', status: 'answered', findings: [{ text: 'Varroa', sources: [1] }] }] }));
    llm.mockResolvedValueOnce(json({ answer: 'About 17 million; varroa.', subQuestions: [{ question: 'How many colonies?', status: 'answered', findings: [{ text: '17 million', sources: [2] }] }, { question: 'Causes of losses?', status: 'answered', findings: [{ text: 'Varroa', sources: [1] }] }] }));
    const out = await runResearch('Bees?', { large: false, reportId: 'hector-report-9-g' });
    expect(search.mock.calls[1][0]).toEqual(['eu colonies count']);
    expect(out.ok && out.report.subQuestions.map((q) => q.question)).toEqual(['How many colonies?', 'Causes of losses?']);
  });
});

describe("Hector's two leftovers (agent phase 2)", () => {
  it('drops broken model text from disagreements', () => {
    const parsed = parseWriteUp(JSON.stringify({ answer: 'About 17 million.', subQuestions: [], disagreements: ['notFound": [{', 'A says 17 million, B says 20 million'], notFound: ['[{"x": 1}]', 'the 2024 figure'] }), ['general']);
    expect(parsed?.disagreements).toEqual(['A says 17 million, B says 20 million']);
    expect(parsed?.notFound).toEqual(['the 2024 figure']);
  });

  it('a short page that answered is too short, not blocked', async () => {
    invoke.mockImplementation(async (cmd: string, args: any) => (cmd === 'fetch_research_sources'
      ? args.sources.map((s: { url: string }) => ({ url: s.url, ok: true, httpStatus: 200, snippet: 'Bees.', pdf: false, title: 'Short' }))
      : null));
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many colonies?', queries: ['honeybee colonies'] }] }));
    search.mockResolvedValueOnce(found(['https://short.example.org/honeybee']));
    llm.mockResolvedValueOnce(json({ answer: 'Unknown.', subQuestions: [{ question: 'How many colonies?', status: 'open', findings: [] }] }));
    search.mockResolvedValue({ sources: [], providers: [], errors: [] });
    const out = await runResearch('How many colonies?', { large: false, reportId: 'hector-report-9-h' });
    expect(out.ok && out.report.sources[0]).toMatchObject({ label: 'snippet', reason: 'too short to read' });
  });
});

// Agent phase 4 (Sentinel): Hector doesn't open a link that looks disguised.
describe('disguised links', () => {
  const answered = json({ answer: 'About 17 million.', subQuestions: [{ question: 'How many?', status: 'answered', findings: [{ text: '17 million', sources: [1] }] }], disagreements: [], notFound: [] });

  it("a disguised link isn't fetched and is listed with its reason", async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many?', queries: ['colonies'] }] })).mockResolvedValueOnce(answered);
    search.mockResolvedValue(found(['https://a.example/x', 'http://paypa1-secure-login.com/verify']));
    const out = await runResearch('How many honeybee colonies?', { large: false, reportId: 'hector-report-d-1' });
    expect(fetched).not.toContain('http://paypa1-secure-login.com/verify');
    if (!out.ok) throw new Error('research failed');
    const src = out.report.sources.find((s) => s.url.includes('paypa1'));
    expect(src).toMatchObject({ label: 'unreadable', excerpt: '' });
    expect(src?.reason).toMatch(/^looks disguised \(/);
  });

  it('a disguised link you gave is skipped with the reason', async () => {
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many?', queries: ['colonies'] }] })).mockResolvedValueOnce(answered);
    search.mockResolvedValue(found(['https://a.example/x']));
    const out = await runResearch('How many honeybee colonies?', { large: false, reportId: 'hector-report-d-2', urls: ['https://xn--pypal-4ve.com/login'] });
    expect(fetched).not.toContain('https://xn--pypal-4ve.com/login');
    if (!out.ok) throw new Error('research failed');
    expect(out.report.sources.find((s) => s.url.includes('xn--'))?.reason).toMatch(/^looks disguised/);
  });
});

describe('Google Web Risk (agent phase 4)', () => {
  it("a listed link isn't read", async () => {
    const answered = json({ answer: 'About 17 million.', subQuestions: [{ question: 'How many?', status: 'answered', findings: [{ text: '17 million', sources: [1] }] }], disagreements: [], notFound: [] });
    llm.mockResolvedValueOnce(json({ subQuestions: [{ question: 'How many?', queries: ['colonies'] }] })).mockResolvedValueOnce(answered);
    search.mockResolvedValue(found(['https://a.example/x', 'https://listed.example/y']));
    webRisk.mockResolvedValueOnce(new Map([['https://listed.example/y', 'malware']]));
    const out = await runResearch('How many honeybee colonies?', { large: false, reportId: 'hector-report-w-1' });
    expect(fetched).not.toContain('https://listed.example/y');
    if (!out.ok) throw new Error('research failed');
    expect(out.report.sources.find((s) => s.url.includes('listed'))?.reason).toBe('listed as malware by Google Web Risk');
  });
});
