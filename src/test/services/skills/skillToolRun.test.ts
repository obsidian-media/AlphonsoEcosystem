// What each skill tool does (agent roles Part B, 2026-10-25).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const research = vi.fn();
const addMemory = vi.fn();
const fetchUrl = vi.fn();
const sendSlack = vi.fn();
vi.mock('../../../services/hectorResearchService', () => ({ runMultiSourceResearch: (...a: unknown[]) => research(...a) }));
vi.mock('../../../services/unifiedMemoryService', () => ({
  addMemoryItem: (...a: unknown[]) => addMemory(...a),
  listMemoryItems: () => [{ title: 'Honeybees decision', content: 'We chose honeybees for the launch video.' }],
}));
vi.mock('../../../services/browserAutomationService', () => ({ fetchUrlContent: (...a: unknown[]) => fetchUrl(...a) }));
vi.mock('../../../services/marcusExecutionService', () => ({ runMarcusDistribution: (...a: unknown[]) => sendSlack(...a) }));

import { runSkillTool } from '../../../services/skills/skillToolRun';
import type { StepInput } from '../../../services/jose/stepInput';

const input: StepInput = {
  instruction: 'Check it', request: 'Write about bees', others: [], memory: '', review: null,
  needs: [{ stepId: 'post', agent: 'miya', text: 'Bees make honey.', files: [], sources: ['https://bees.example/a'], cut: 0, main: 'Bees make honey.' }],
};

beforeEach(() => { research.mockReset(); addMemory.mockReset(); fetchUrl.mockReset(); sendSlack.mockReset(); });

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
    research.mockResolvedValueOnce({ ok: true, sources: [{ title: 'All about bees', url: 'https://bees.example', snippet: 'Bees are insects.' }] });
    expect(await runSkillTool('web_search', { query: 'bees' }, { agent: 'hector', stepInput: input }))
      .toEqual({ ok: true, text: '- All about bees (https://bees.example): Bees are insects.' });
    expect(research).toHaveBeenCalledWith('bees');
  });

  it('read_memory finds matching notes', async () => {
    const result = await runSkillTool('read_memory', { query: 'honeybees launch' }, { agent: 'echo', stepInput: input });
    expect(result.ok).toBe(true);
    expect(result.text).toContain('Honeybees decision');
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
});
