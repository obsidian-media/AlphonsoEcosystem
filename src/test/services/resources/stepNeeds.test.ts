// Resource manager Task 3: what a step needs, known sizes first, then learned from use.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
const providers: Record<string, string> = {};
vi.mock('../../../services/modelSelectionService', () => ({
  getAgentProvider: (agent: string) => ({ provider: providers[agent] || 'ollama' }),
}));
vi.mock('../../../lib/ollama', () => ({
  getAgentModelOverride: () => null,
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
}));
const engines = { voice: { engine: 'kokoro' }, pictures: 'comfyui', clips: 'local' } as any;
vi.mock('../../../services/contentFactory/engineChoice', () => ({ projectEngines: () => engines }));
vi.mock('../../../services/contentFactory/contentProjectService', () => ({ getProject: (id: string) => (id ? { id } : null) }));
vi.mock('../../../services/videoModelService', () => ({
  listVideoModels: async () => ({ vramGb: 8, suggested: 'ltx', comfyuiDir: 'c', models: [{ id: 'ltx', minVramGb: 6, installed: true }] }),
  effectiveVideoModel: (info: any) => info.models[0],
}));

import { toolsForStep, estimateNeed, recordStepUse, resetUsageForTests } from '../../../services/resources/stepNeeds';

const content = (actionType: string, agent = 'miya') => ({ agent, actionType, contentStep: { projectId: 'p1', brand: {} } });

beforeEach(() => {
  for (const k of Object.keys(backend)) delete backend[k];
  for (const k of Object.keys(providers)) delete providers[k];
  Object.assign(engines, { voice: { engine: 'kokoro' }, pictures: 'comfyui', clips: 'local' });
  localStorage.clear();
  resetUsageForTests();
  backend.ollama_list_models = () => ({ models: [{ name: 'llama3.2:3b', size: 2 * 1024 ** 3 }] });
  backend.media_tools_status = () => ({ ffmpeg: true, kokoro: true, audiocraft: true, whisper: false });
});

describe('toolsForStep', () => {
  it('an agent step on a local model needs Ollama', () => {
    expect(toolsForStep({ agent: 'hector', actionType: 'research_report' })).toEqual(['ollama']);
  });

  it('a step on a cloud or paid model needs nothing on this computer', () => {
    providers.hector = 'nvidia_nim';
    expect(toolsForStep({ agent: 'hector', actionType: 'research_report' })).toEqual([]);
    providers.nova = 'gemini';
    expect(toolsForStep({ agent: 'nova', actionType: 'analysis_market' })).toEqual([]);
    providers.maria = 'openrouter';
    expect(toolsForStep({ agent: 'maria', actionType: 'audit_quality' })).toEqual([]);
    expect(toolsForStep({ agent: 'alphonso', actionType: 'assistant_answer', model: 'claude:claude-haiku-5-5' })).toEqual([]);
    expect(toolsForStep({ agent: 'alphonso', actionType: 'assistant_answer', model: 'openrouter:b/y' })).toEqual([]);
  });

  it('picture steps need the model and ComfyUI, unless Higgsfield makes the pictures', () => {
    expect(toolsForStep(content('creative_scenes'))).toEqual(['ollama', 'comfyui']);
    engines.pictures = 'higgsfield';
    expect(toolsForStep(content('creative_scenes'))).toEqual(['ollama']);
  });

  it('voice uses Kokoro, or nothing here with ElevenLabs', () => {
    expect(toolsForStep(content('creative_voice'))).toEqual(['kokoro']);
    engines.voice = { engine: 'elevenlabs', voiceId: 'v' };
    expect(toolsForStep(content('creative_voice'))).toEqual([]);
  });

  it('clips need ComfyUI only when made on this computer', () => {
    expect(toolsForStep(content('creative_video_clips'))).toEqual(['comfyui']);
    engines.clips = 'runway';
    expect(toolsForStep(content('creative_video_clips'))).toEqual([]);
  });

  it('music, b-roll and assembly', () => {
    expect(toolsForStep(content('creative_music'))).toEqual(['audiocraft']);
    expect(toolsForStep(content('research_broll', 'hector'))).toEqual([]);
    expect(toolsForStep(content('creative_assemble_video'))).toEqual(['ffmpeg']);
  });

  it('an unknown task type counts as the agent model (fail safe)', () => {
    expect(toolsForStep({ agent: 'miya', actionType: 'something_new' })).toEqual(['ollama']);
  });
});

describe('estimateNeed', () => {
  it('a model step needs the model size plus 20% of graphics memory, which may spill into RAM', async () => {
    const need = await estimateNeed({ agent: 'hector', actionType: 'research_report' });
    expect(need).toMatchObject({ tools: ['ollama'], ramMb: 0, gpuMb: 2458, gpuSpillsToRam: true, modelKey: 'model:llama3.2:3b', learned: false, known: true });
    expect(need.key).toBe('research_report|llama3.2:3b');
  });

  it('a local clip needs its video model\'s listed graphics memory, which does not spill', async () => {
    const need = await estimateNeed(content('creative_video_clips'));
    expect(need).toMatchObject({ tools: ['comfyui'], gpuMb: 6144, gpuSpillsToRam: false, known: true });
    expect(need.key).toBe('creative_video_clips|ltx');
  });

  it('a picture step needs the larger of the model and ComfyUI, not the sum', async () => {
    recordStepUse('creative_scenes|comfyui', { ramMb: 500, gpuMb: 3000 });
    const need = await estimateNeed(content('creative_scenes'));
    expect(need.gpuMb).toBe(3000);
    expect(need.gpuSpillsToRam).toBe(false);
  });

  it('a size it cannot know is zero and marked unknown until learned', async () => {
    const need = await estimateNeed(content('creative_voice'));
    expect(need).toMatchObject({ tools: ['kokoro'], ramMb: 0, gpuMb: 0, known: false, learned: false });
  });

  it('prefers the average of what was used before', async () => {
    for (let i = 0; i < 3; i += 1) recordStepUse('research_report|llama3.2:3b', { ramMb: 1000, gpuMb: 3000 });
    const need = await estimateNeed({ agent: 'hector', actionType: 'research_report' });
    expect(need).toMatchObject({ ramMb: 1000, gpuMb: 3000, learned: true, known: true });
  });

  it('keeps only the last 5 readings per kind of step', async () => {
    recordStepUse('research_report|llama3.2:3b', { ramMb: 9000, gpuMb: 9000 });
    for (let i = 0; i < 5; i += 1) recordStepUse('research_report|llama3.2:3b', { ramMb: 100, gpuMb: 200 });
    const need = await estimateNeed({ agent: 'hector', actionType: 'research_report' });
    expect(need).toMatchObject({ ramMb: 100, gpuMb: 200 });
  });

  it('a step needing nothing here needs zero', async () => {
    providers.hector = 'nvidia_nim';
    const need = await estimateNeed({ agent: 'hector', actionType: 'research_report' });
    expect(need).toMatchObject({ tools: [], ramMb: 0, gpuMb: 0, known: true });
  });

  it('never throws when the backend is missing', async () => {
    delete backend.ollama_list_models;
    const need = await estimateNeed({ agent: 'hector', actionType: 'research_report' });
    expect(need).toMatchObject({ tools: ['ollama'], gpuMb: 0, known: false });
  });
});
