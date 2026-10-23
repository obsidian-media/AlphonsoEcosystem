import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(),
}));
vi.mock('../../../services/hectorResearchService', () => ({
  runMultiSourceResearch: vi.fn(async () => ({ ok: true, sources: [
    { url: 'https://real.example/a', title: 'Real A', snippet: 'a' },
    { url: 'https://real.example/b', title: 'Real B', snippet: 'b' },
  ], providerChain: ['duckduckgo_html'] })),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { executeContentStepAssignment, clearContentSearches } from '../../../services/contentFactory/contentAgentExecutor';
import { runMultiSourceResearch } from '../../../services/hectorResearchService';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, saveStepVersion, getProject } from '../../../services/contentFactory/contentProjectService';

const good = JSON.stringify({ hookScore: 8, scriptScore: 7, notes: ['clear'], mustFix: [] });

function assignment(actionType = 'analysis_content_review', agent = 'nova'): never {
  return {
    agent,
    actionType,
    contentStep: {
      projectId: 'p1', step: 'review', task: 'Review it.', prior: {},
      brief: { idea: 'Idea', platforms: [], outputs: [], format: 'story', lengthSec: 30, notes: '', writeInMyVoice: false, showEverything: false },
      brand: { name: 'B', palette: [], references: [{ url: 'https://ref.example', note: '' }], lessons: [], pastScripts: '' },
    },
  } as never;
}

// Braces matter: a function returned from beforeEach is run as cleanup after
// each test, and mockReset() returns the mock itself.
beforeEach(() => { vi.mocked(generateAgentLlmResponse).mockReset(); clearContentSearches(); });

describe('executeContentStepAssignment', () => {
  it('asks the assignment\'s own agent for JSON and returns the parsed answer', async () => {
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: good, done: true });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('completed');
    expect(result.artifacts[0]).toMatchObject({ type: 'content_step_output', actionType: 'analysis_content_review', data: { hookScore: 8 } });
    const [agent, options] = vi.mocked(generateAgentLlmResponse).mock.calls[0];
    expect(agent).toBe('nova');
    expect(options).toMatchObject({ format: 'json', sessionId: 'content:p1:review' });
    expect(options.prompt).toContain('Return JSON only');
  });

  it('asks again once when the first answer cannot be read', async () => {
    vi.mocked(generateAgentLlmResponse)
      .mockResolvedValueOnce({ response: 'Sure! Here is my review.', done: true })
      .mockResolvedValueOnce({ response: good, done: true });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('completed');
    expect(generateAgentLlmResponse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateAgentLlmResponse).mock.calls[1][1].prompt).toContain('could not be read');
  });

  it('fails, saying so, when both answers cannot be read', async () => {
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: 'no json here', done: true });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toMatch(/^The model's answer could not be read\. .*larger model.*Agent Providers/);
    expect(result.artifacts[0].raw).toBe('no json here');
    expect(result.summary).toContain("could not be read");
  });

  it('fails with the error when the model cannot be reached', async () => {
    vi.mocked(generateAgentLlmResponse).mockImplementation(async () => { throw new Error('Ollama is not running'); });
    const result = await executeContentStepAssignment(assignment());
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toContain('Ollama is not running');
  });

  // QA 2026-10-22: a local model has no internet; asked alone it invented
  // reference links (https://example.com/...). Hector searches for real first.
  it('researches from real search results only, and drops invented links', async () => {
    const research = JSON.stringify({
      references: [
        { title: 'Real A', url: 'https://real.example/a', whyItWorks: 'w', hook: 'h' },
        { title: 'Made up', url: 'https://example.com/made-up', whyItWorks: 'w', hook: 'h' },
      ],
      patterns: ['a', 'b', 'c'], hookIdeas: ['x', 'y', 'z'],
    });
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: research, done: true });
    const result = await executeContentStepAssignment(assignment('research_virality', 'hector'));
    expect(result.resultState).toBe('completed');
    expect(vi.mocked(generateAgentLlmResponse).mock.calls[0][1].prompt).toContain('https://real.example/b');
    expect((result.artifacts[0].data as { references: { url: string }[] }).references.map((r) => r.url)).toEqual(['https://real.example/a']);
    expect(result.sources).toEqual(['https://real.example/a']);
  });

  it('fails, saying why, when the search finds nothing', async () => {
    vi.mocked(runMultiSourceResearch).mockClear();
    vi.mocked(runMultiSourceResearch).mockResolvedValueOnce({ ok: true, sources: [], providerChain: [] } as never);
    const result = await executeContentStepAssignment(assignment('research_virality', 'hector'));
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toMatch(/found no web results/);
    expect(generateAgentLlmResponse).not.toHaveBeenCalled();
    // Retry searches again instead of reusing the empty result.
    await executeContentStepAssignment(assignment('research_virality', 'hector'));
    expect(runMultiSourceResearch).toHaveBeenCalledTimes(2);
  });

  it('fails when every reference was made up', async () => {
    const research = JSON.stringify({
      references: [{ title: 'Made up', url: 'https://example.com/x', whyItWorks: 'w', hook: 'h' }],
      patterns: ['a', 'b', 'c'], hookIdeas: ['x', 'y', 'z'],
    });
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: research, done: true });
    const result = await executeContentStepAssignment(assignment('research_virality', 'hector'));
    expect(result.resultState).toBe('failed');
  });

  // Phase 6b: a project's steps run in one request, so a step reads the
  // project's outputs as they are when it runs, not when the plan was made.
  it("uses the project's current outputs, not the ones from when the plan was made", async () => {
    localStorage.clear();
    const brand = saveBrand({ name: 'B' });
    const project = createProject(brand.id, 'P', { ...emptyBrief(), idea: 'Idea' });
    saveStepVersion(project.id, 'script', { output: { miya: { script: 'THE-LIVE-SCRIPT' } }, summary: 's', joseCommandId: null });
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: good, done: true });
    const a = assignment() as any;
    a.contentStep = { ...a.contentStep, projectId: project.id, brand: getProject(project.id) && brand, prior: {} };
    await executeContentStepAssignment(a);
    expect(vi.mocked(generateAgentLlmResponse).mock.calls[0][1].prompt).toContain('THE-LIVE-SCRIPT');
  });

  it("a revision's findings reach the prompt", async () => {
    vi.mocked(generateAgentLlmResponse).mockResolvedValue({ response: good, done: true });
    const a = { ...(assignment() as any), instruction: ['Review it.', '', 'Fix what the review found:', '- Make the hook shorter'].join(String.fromCharCode(10)) };
    await executeContentStepAssignment(a);
    expect(vi.mocked(generateAgentLlmResponse).mock.calls[0][1].prompt).toContain('Make the hook shorter');
  });
});
