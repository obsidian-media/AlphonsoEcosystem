// What each skill tool does (agent roles Part B, 2026-10-25).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const research = vi.fn();
const addMemory = vi.fn();
const fetchUrl = vi.fn();
const sendSlack = vi.fn();
vi.mock('../../../services/hector/searchChain', () => ({ searchChain: (...a: unknown[]) => research(...a) }));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const bookmarks = vi.fn(() => [{ title: 'EU bee report', url: 'https://ec.europa.eu/bees', summary: 'Colony numbers' }]);
vi.mock('../../../services/hectorBookmarkService', () => ({ getBookmarks: (...a: unknown[]) => bookmarks(...(a as [])) }));
vi.mock('../../../services/unifiedMemoryService', () => ({
  addMemoryItem: (...a: unknown[]) => addMemory(...a),
  listMemoryItems: () => [{ title: 'Honeybees decision', content: 'We chose honeybees for the launch video.' }],
}));
vi.mock('../../../services/browserAutomationService', () => ({ fetchUrlContent: (...a: unknown[]) => fetchUrl(...a) }));
vi.mock('../../../services/marcusExecutionService', () => ({ runMarcusDistribution: (...a: unknown[]) => sendSlack(...a) }));

import { runSkillTool } from '../../../services/skills/skillToolRun';
import type { StepInput } from '../../../services/jose/stepInput';
import { addDecision } from '../../../services/echo/decisions';

const input: StepInput = {
  instruction: 'Check it', request: 'Write about bees', others: [], memory: '', review: null,
  needs: [{ stepId: 'post', agent: 'miya', text: 'Bees make honey.', files: [], sources: ['https://bees.example/a'], cut: 0, main: 'Bees make honey.' }],
};

beforeEach(() => { research.mockReset(); addMemory.mockReset(); fetchUrl.mockReset(); sendSlack.mockReset(); invoke.mockReset(); invoke.mockResolvedValue(null); localStorage.clear(); });

describe('runSkillTool', () => {
  it("refuses a tool the agent can't use", async () => {
    expect(await runSkillTool('web_search', { query: 'bees' }, { agent: 'maria', stepInput: input }))
      .toEqual({ ok: false, text: "Maria can't use web_search." });
    expect(research).not.toHaveBeenCalled();
  });

  it('refuses an unknown tool', async () => {
    expect(await runSkillTool('teleport', {}, { agent: 'hector', stepInput: input })).toEqual({ ok: false, text: 'Unknown tool: teleport.' });
  });

  it('action tools never run', async () => {
    const result = await runSkillTool('send_message', { text: 'hi' }, { agent: 'marcus', stepInput: input });
    expect(result).toEqual({ ok: false, text: "This tool runs as the step's own action, after its approval." });
    expect(sendSlack).not.toHaveBeenCalled();
  });

  it('read_step_output reads a needed step by id, and lists the ids otherwise', async () => {
    expect(await runSkillTool('read_step_output', { stepId: 'post' }, { agent: 'maria', stepInput: input }))
      .toEqual({ ok: true, text: "Miya's step (post):\nBees make honey." });
    expect((await runSkillTool('read_step_output', { stepId: 'nope' }, { agent: 'maria', stepInput: input })).text)
      .toBe('No step "nope". Steps you can read: post.');
  });

  it('read_sources lists the sources earlier steps used', async () => {
    expect(await runSkillTool('read_sources', {}, { agent: 'nova', stepInput: input })).toEqual({ ok: true, text: 'https://bees.example/a' });
  });

  it('web_search returns titles and links', async () => {
    research.mockResolvedValueOnce({ sources: [{ title: 'All about bees', url: 'https://bees.example', snippet: 'Bees are insects.', provider: 'duckduckgo', kind: 'general' }], providers: ['duckduckgo'], errors: [] });
    expect(await runSkillTool('web_search', { query: 'bees' }, { agent: 'hector', stepInput: input }))
      .toEqual({ ok: true, text: '- All about bees (https://bees.example): Bees are insects.' });
    expect(research).toHaveBeenCalledWith(['bees'], { limit: 8 });
  });

  // Agent phase 7: read_memory reads the decision records.
  it('read_memory finds matching decisions', async () => {
    addDecision({ kind: 'decision', text: 'We use honeybees in the launch video.', topics: ['honeybees', 'launch'], source: { surface: 'chat', by: 'you' } } as never);
    const result = await runSkillTool('read_memory', { query: 'honeybees launch' }, { agent: 'echo', stepInput: input });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('We use honeybees in the launch video.');
    localStorage.clear();
    expect((await runSkillTool('read_memory', { query: 'honeybees' }, { agent: 'echo', stepInput: input })).text).toBe('Memory holds nothing about this.');
  });

  it('save_note saves a memory item for the agent', async () => {
    addMemory.mockReturnValueOnce({ id: 'm1' });
    expect(await runSkillTool('save_note', { title: 'Bees', text: 'Use honeybees.' }, { agent: 'hector', stepInput: input }))
      .toEqual({ ok: true, text: 'Saved the note "Bees".' });
    expect(addMemory).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bees', content: 'Use honeybees.', agentId: 'hector', type: 'agent_note' }));
  });

  it('cuts long text at 4,000 characters', async () => {
    fetchUrl.mockResolvedValueOnce({ content: 'x'.repeat(5000) });
    const result = await runSkillTool('fetch_source', { url: 'https://bees.example' }, { agent: 'hector', stepInput: input });
    expect(result.text.length).toBeLessThan(4100);
    expect(result.text.endsWith('(cut)')).toBe(true);
  });

  it('a failing wrapped function gives ok: false with its message', async () => {
    research.mockRejectedValueOnce(new Error('no search key'));
    expect(await runSkillTool('web_search', { query: 'bees' }, { agent: 'hector', stepInput: input }))
      .toEqual({ ok: false, text: 'web_search failed: no search key' });
  });

  it('read_project_file needs a project folder', async () => {
    expect(await runSkillTool('read_project_file', { path: 'a.txt' }, { agent: 'alphonso', stepInput: input }))
      .toEqual({ ok: false, text: 'No project folder is set.' });
  });

  it('read_sources gives a research step\'s numbered sources with excerpts (agent phase 1)', async () => {
    const { setStepOutput } = await import('../../../services/jose/joseStepOutputs');
    setStepOutput('c1', 'research', 'hector', {
      summary: 'Answer', artifacts: [{ type: 'hector_report', reportId: 'hector-report-1-a' }],
      schema: { sources: [{ n: 1, title: 'EU report', url: 'https://ec.europa.eu/bees', label: 'read', excerpt: 'About 17 million colonies.' }] },
    } as never);
    const withResearch = { ...input, needs: [{ stepId: 'research', agent: 'hector', text: 'Answer', files: [], sources: ['https://ec.europa.eu/bees'], cut: 0, main: 'Answer' }] };
    expect(await runSkillTool('read_sources', {}, { agent: 'maria', stepInput: withResearch, commandId: 'c1' }))
      .toEqual({ ok: true, text: '[1] EU report — https://ec.europa.eu/bees (read)\nAbout 17 million colonies.' });
  });

  // Agent phase 3: reviewing a post, Maria reads the sources the post was built from.
  it("read_sources in a review reads the reviewed work's sources", async () => {
    const { setStepOutput } = await import('../../../services/jose/joseStepOutputs');
    const { createJoseRequest } = await import('../../../services/jose/joseRequestStore');
    createJoseRequest({ commandId: 'c9', source: 'user', text: 't', kind: 'normal', steps: [
      { stepId: 'hector', agent: 'hector', actionType: 'research', effects: ['read'], needs: [] },
      { stepId: 'write', agent: 'alphonso', actionType: 'assistant_write', effects: ['read'], needs: ['hector'] },
      { stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: ['write'], reviewOf: 'write' },
    ] } as never);
    setStepOutput('c9', 'hector', 'hector', { summary: 'Answer', schema: { sources: [{ n: 1, title: 'Bee facts', url: 'https://bees.example/facts', label: 'read', excerpt: 'Wings beat 11,400 times a minute.' }] } } as never);
    setStepOutput('c9', 'write', 'alphonso', { summary: 'The post' } as never);
    const review = { stepId: 'write', agent: 'alphonso', text: 'The post', files: [], sources: [], cut: 0, main: 'The post' };
    const reviewing = { ...input, needs: [review], review };
    expect(await runSkillTool('read_sources', {}, { agent: 'maria', stepInput: reviewing, commandId: 'c9' }))
      .toEqual({ ok: true, text: '[1] Bee facts — https://bees.example/facts (read)\nWings beat 11,400 times a minute.' });
  });

  it('read_source_page reads a saved page by number', async () => {
    const { setStepOutput } = await import('../../../services/jose/joseStepOutputs');
    setStepOutput('c2', 'research', 'hector', { summary: 'Answer', artifacts: [{ type: 'hector_report', reportId: 'hector-report-2-b' }] } as never);
    invoke.mockImplementation(async (cmd: string) => (cmd === 'research_read_page' ? 'The full page text.' : null));
    const withResearch = { ...input, needs: [{ stepId: 'research', agent: 'hector', text: 'Answer', files: [], sources: [], cut: 0, main: 'Answer' }] };
    expect(await runSkillTool('read_source_page', { n: 2 }, { agent: 'maria', stepInput: withResearch, commandId: 'c2' }))
      .toEqual({ ok: true, text: 'The full page text.' });
    expect(invoke).toHaveBeenCalledWith('research_read_page', { reportId: 'hector-report-2-b', n: 2 });
  });

  it('read_bookmarks lists the sources you saved (Hector only)', async () => {
    expect(await runSkillTool('read_bookmarks', {}, { agent: 'hector', stepInput: input }))
      .toEqual({ ok: true, text: '- EU bee report (https://ec.europa.eu/bees): Colony numbers' });
    expect((await runSkillTool('read_bookmarks', {}, { agent: 'maria', stepInput: input })).ok).toBe(false);
  });
});

describe('fetch_source and disguised links (agent phase 4)', () => {
  it('fetch_source refuses a disguised address', async () => {
    fetchUrl.mockClear();
    const result = await runSkillTool('fetch_source', { url: 'https://185.23.4.9/login' }, { agent: 'hector', stepInput: input });
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/^Not read: looks disguised/);
    expect(fetchUrl).not.toHaveBeenCalled();
  });
});
