import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend: Record<string, (args: any) => unknown> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (!backend[cmd]) throw new Error(`unexpected command ${cmd}`);
    return backend[cmd](args);
  }),
}));
vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: vi.fn(async () => ({ response: '{"prompt":"calm lofi beat with soft piano"}' })),
  freeOllamaGpuMemory: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../../services/connectors/stockFootageConnector', () => ({
  configuredStockSources: vi.fn(() => []),
  searchStockClips: vi.fn(async () => []),
}));

import { invoke } from '@tauri-apps/api/core';
import { freeOllamaGpuMemory, generateAgentLlmResponse } from '../../../lib/ollama';
import { configuredStockSources, searchStockClips } from '../../../services/connectors/stockFootageConnector';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion, setVersionOutputField } from '../../../services/contentFactory/contentProjectService';
import { MEDIA_ACTIONS, executeMediaStep } from '../../../services/contentFactory/contentMediaExecutor';

const SCRIPT = { hooks: ['a', 'b', 'c'], chosenHook: 0, title: 'T', script: [
  { startSec: 0, endSec: 3, spoken: 'Hello there.' },
  { startSec: 3, endSec: 6, spoken: 'Second part.' },
] };
const SCENES = { style: 'warm', scenes: [
  { id: 's1', startSec: 0, endSec: 3, description: 'A barista pours coffee', imagePrompt: 'x' },
  { id: 's2', startSec: 3, endSec: 6, description: 'People smile', imagePrompt: 'y' },
  { id: 's3', startSec: 6, endSec: 9, description: 'Logo on a cup', imagePrompt: 'z' },
] };

function setup() {
  const brand = saveBrand({ name: 'My brand', palette: ['#112233', '#eeddcc'], voice: { engine: 'kokoro', voiceId: 'af_heart' } } as any);
  const project = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait', outputs: ['YouTube video'] });
  saveStepVersion(project.id, 'script', { output: { miya: SCRIPT }, summary: '', joseCommandId: null });
  saveStepVersion(project.id, 'scenes', { output: { miya: SCENES }, summary: '', joseCommandId: null });
  return { brand, project, dir: `${brand.folderName}/${project.folderName}` };
}

function assignment(project: any, brand: any, agent: string, actionType: string, step: string) {
  return { agent, actionType, contentStep: { projectId: project.id, step, brief: project.brief, brand, prior: {}, task: '' } } as any;
}

const voiceOutput = (dir: string) => ({
  full: `${dir}/audio/voice-v1/full.wav`, durationSec: 8, lines: [
    { sceneId: 's1', text: 'Hello there.', startSec: 0, endSec: 2.5, path: `${dir}/audio/voice-v1/s1.wav` },
    { sceneId: 's2', text: 'Second part.', startSec: 2.5, endSec: 5, path: `${dir}/audio/voice-v1/s2.wav` },
    { sceneId: 's3', text: '', startSec: 5, endSec: 8, path: null },
  ],
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:\\Content' }));
  for (const k of Object.keys(backend)) delete backend[k];
  vi.clearAllMocks();
  vi.mocked(configuredStockSources).mockReturnValue([]);
});

// Miya content factory phase 2a: the steps that make the finished video file.
describe('executeMediaStep', () => {
  it('handles the media task types (AI clips since phase 2b)', () => {
    expect([...MEDIA_ACTIONS].sort()).toEqual(['creative_music', 'creative_video_clips', 'creative_voice', 'research_broll', 'runtime_assemble_video']);
  });

  it('Voice speaks each scene\'s lines in the brand voice; a quiet scene keeps its planned seconds', async () => {
    const { brand, project, dir } = setup();
    backend.content_tts_kokoro = () => ({ ok: true, full: { path: 'D:\\Content\\x\\full.wav', durationSec: 8 }, files: [
      { id: 's1', path: 'p1', durationSec: 2.5, startSec: 0 },
      { id: 's2', path: 'p2', durationSec: 2.5, startSec: 2.5 },
      { id: 's3', path: null, durationSec: 3, startSec: 5 },
    ] });
    const result = await executeMediaStep(assignment(project, brand, 'miya', 'creative_voice', 'voice'));
    expect(result.resultState).toBe('completed');
    expect(invoke).toHaveBeenCalledWith('content_tts_kokoro', { request: {
      workspaceRoot: 'D:\\Content', outDir: `${dir}/audio/voice-v1`, voiceId: 'af_heart',
      lines: [{ id: 's1', text: 'Hello there.' }, { id: 's2', text: 'Second part.' }, { id: 's3', text: '', pauseSec: 3 }],
    } });
    expect(result.artifacts[0].data).toEqual(voiceOutput(dir));
  });

  it('Voice fails with the way to fix it when Kokoro is missing', async () => {
    const { brand, project } = setup();
    backend.content_tts_kokoro = () => ({ ok: false, error: 'Kokoro is not installed. Install Kokoro in Runtime Hub.' });
    const result = await executeMediaStep(assignment(project, brand, 'miya', 'creative_voice', 'voice'));
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toContain('Install Kokoro in Runtime Hub.');
  });

  it('Music is skipped, with a note, when AudioCraft is not installed', async () => {
    const { brand, project, dir } = setup();
    backend.media_tools_status = () => ({ audiocraft: false });
    const result = await executeMediaStep(assignment(project, brand, 'miya', 'creative_music', 'music'));
    // Checked before asking a model: no model call, nothing generated.
    expect(generateAgentLlmResponse).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('content_music_generate', expect.anything());
    expect(dir).toBeTruthy();
    expect(result.resultState).toBe('completed');
    expect(result.artifacts[0].data).toEqual({ skipped: 'AudioCraft is not installed. Install it in Runtime Hub to add music.' });
  });

  it('Music saves the bed and its prompt', async () => {
    const { brand, project, dir } = setup();
    backend.media_tools_status = () => ({ audiocraft: true });
    backend.content_music_generate = () => ({ ok: true, path: 'abs', seconds: 8 });
    const result = await executeMediaStep(assignment(project, brand, 'miya', 'creative_music', 'music'));
    expect(generateAgentLlmResponse).toHaveBeenCalledWith('miya', expect.objectContaining({ format: 'json' }));
    expect(freeOllamaGpuMemory).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('content_music_generate', { request: expect.objectContaining({
      workspaceRoot: 'D:\\Content', outPath: `${dir}/audio/music-v1.wav`, prompt: 'calm lofi beat with soft piano',
    }) });
    expect(result.artifacts[0].data).toMatchObject({ path: `${dir}/audio/music-v1.wav`, prompt: 'calm lofi beat with soft piano' });
  });

  it('B-roll is skipped, with a note, when no stock footage key is set', async () => {
    const { brand, project } = setup();
    const result = await executeMediaStep(assignment(project, brand, 'hector', 'research_broll', 'broll'));
    expect(result.resultState).toBe('completed');
    expect((result.artifacts[0].data as any).skipped).toMatch(/^No stock footage keys are set/);
    expect(searchStockClips).not.toHaveBeenCalled();
  });

  it('B-roll downloads one clip per scene with its source, author and license', async () => {
    const { brand, project, dir } = setup();
    vi.mocked(configuredStockSources).mockReturnValue(['pexels']);
    vi.mocked(searchStockClips).mockImplementation(async (query) => (query.includes('barista') ? [{
      source: 'pexels', id: '7', url: 'https://videos.pexels.com/7.mp4', durationSec: 10, width: 1920, height: 1080,
      author: 'Ana', pageUrl: 'https://www.pexels.com/video/7', license: 'Pexels License',
    }] : []) as any);
    backend.content_download_media = () => ({ ok: true, path: 'abs', bytes: 10 });
    const result = await executeMediaStep(assignment(project, brand, 'hector', 'research_broll', 'broll'));
    expect(searchStockClips).toHaveBeenCalledWith(expect.stringContaining('barista'), { orientation: 'landscape', minSeconds: 3 });
    expect(invoke).toHaveBeenCalledWith('content_download_media', { request: expect.objectContaining({
      workspaceRoot: 'D:\\Content', url: 'https://videos.pexels.com/7.mp4', relPath: `${dir}/broll/v1-s1.mp4`,
    }) });
    const clips = (result.artifacts[0].data as any).clips;
    expect(clips[0]).toMatchObject({ sceneId: 's1', path: `${dir}/broll/v1-s1.mp4`, source: 'pexels', author: 'Ana', license: 'Pexels License', pageUrl: 'https://www.pexels.com/video/7' });
    expect(clips[1]).toMatchObject({ sceneId: 's2', path: null });
  });

  it('Assemble needs the voice-over first', async () => {
    const { brand, project } = setup();
    const result = await executeMediaStep(assignment(project, brand, 'alphonso', 'runtime_assemble_video', 'assemble'));
    expect(result.resultState).toBe('failed');
    expect(result.failureReason).toBe('Run the Voice step first.');
  });

  it('Assemble cuts the clip, picture or colour card per scene with the voice, music and captions', async () => {
    const { brand, project, dir } = setup();
    setVersionOutputField(project.id, 'scenes', 1, 'pictures', [
      { sceneId: 's1', status: 'done', relativePath: `${dir}/scenes/v1-s1.png` },
      { sceneId: 's2', status: 'done', relativePath: `${dir}/scenes/v1-s2.png` },
      { sceneId: 's3', status: 'failed', error: 'x' },
    ]);
    saveStepVersion(project.id, 'voice', { output: { miya: voiceOutput(dir) }, summary: '', joseCommandId: null });
    saveStepVersion(project.id, 'music', { output: { miya: { path: `${dir}/audio/music-v1.wav`, prompt: 'p' } }, summary: '', joseCommandId: null });
    saveStepVersion(project.id, 'broll', { output: { hector: { clips: [{ sceneId: 's1', path: `${dir}/broll/v1-s1.mp4` }, { sceneId: 's2', path: null }] } }, summary: '', joseCommandId: null });
    backend.media_tools_status = () => ({ ffmpeg: 'f', ffprobe: 'p', kokoro: true, audiocraft: true, whisper: false });
    const written: Record<string, string> = {};
    backend.write_workspace_text_file = (a) => { written[a.relativePath] = a.content; return { ok: true }; };
    backend.content_assemble_video = () => ({ ok: true, outputs: [
      { aspect: '16x9', path: 'v1-16x9.mp4', durationSec: 8, frames: ['v1-16x9-10.jpg'] },
      { aspect: '9x16', path: 'v1-9x16.mp4', durationSec: 8, frames: ['v1-9x16-10.jpg'] },
    ] });
    const result = await executeMediaStep(assignment(project, brand, 'alphonso', 'runtime_assemble_video', 'assemble'));
    expect(result.resultState).toBe('completed');
    expect(invoke).toHaveBeenCalledWith('content_assemble_video', { spec: {
      workspaceRoot: 'D:\\Content', outDir: `${dir}/output`, version: 1,
      scenes: [
        { clip: `${dir}/broll/v1-s1.mp4`, seconds: 2.5 },
        { picture: `${dir}/scenes/v1-s2.png`, seconds: 2.5 },
        { cardColor: '#112233', seconds: 3 },
      ],
      voice: `${dir}/audio/voice-v1/full.wav`, voiceSeconds: 8, music: `${dir}/audio/music-v1.wav`,
      srt: `${dir}/output/v1.srt`, captionColor: '#eeddcc', outlineColor: '#112233',
    } });
    expect(written[`${dir}/output/v1.srt`]).toMatch(/^1\n00:00:00,000 --> /);
    expect(written[`${dir}/output/v1.srt`]).toContain('Hello there.');
    const data = result.artifacts[0].data as any;
    expect(data.outputs.map((o: any) => o.path)).toEqual([`${dir}/output/v1-16x9.mp4`, `${dir}/output/v1-9x16.mp4`]);
    expect(data.outputs[0].frames).toEqual([`${dir}/output/v1-16x9-10.jpg`]);
    expect(data.captions).toBe('lines');
    expect(data.note).toMatch(/Whisper/);
  });

  // Phase 2b: an AI clip plays first in its scene; only clips that were made are sent.
  it('Assemble sends each scene AI clip and its length, only for clips that were made', async () => {
    const { brand, project, dir } = setup();
    saveStepVersion(project.id, 'voice', { output: { miya: voiceOutput(dir) }, summary: '', joseCommandId: null });
    saveStepVersion(project.id, 'clips', { output: { miya: { engine: 'local', clips: [
      { sceneId: 's1', status: 'done', path: `${dir}/clips/v1-s1.mp4`, seconds: 2 },
      { sceneId: 's2', status: 'pending', jobId: 'j', seconds: 2 },
      { sceneId: 's3', status: 'failed', reason: 'x' },
    ] } }, summary: '', joseCommandId: null });
    backend.media_tools_status = () => ({ whisper: false });
    backend.write_workspace_text_file = () => ({ ok: true });
    backend.content_assemble_video = () => ({ ok: true, outputs: [] });
    await executeMediaStep(assignment(project, brand, 'alphonso', 'runtime_assemble_video', 'assemble'));
    const sent = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'content_assemble_video')![1] as any;
    expect(sent.spec.scenes[0]).toMatchObject({ aiClip: `${dir}/clips/v1-s1.mp4`, aiSeconds: 2 });
    expect(sent.spec.scenes[1].aiClip).toBeUndefined();
    expect(sent.spec.scenes[2].aiClip).toBeUndefined();
  });

  it('Assemble times the captions with Whisper when it is installed, keeping the script\'s words', async () => {
    const { brand, project, dir } = setup();
    saveStepVersion(project.id, 'voice', { output: { miya: voiceOutput(dir) }, summary: '', joseCommandId: null });
    backend.media_tools_status = () => ({ whisper: true });
    backend.content_whisper_words = () => ({ ok: true, words: [
      { word: 'Hello', start: 0.1, end: 0.5 }, { word: 'their', start: 0.5, end: 1 },
      { word: 'Second', start: 2.6, end: 3 }, { word: 'part', start: 3, end: 3.4 },
    ] });
    const written: Record<string, string> = {};
    backend.write_workspace_text_file = (a) => { written[a.relativePath] = a.content; return { ok: true }; };
    backend.content_assemble_video = () => ({ ok: true, outputs: [] });
    const result = await executeMediaStep(assignment(project, brand, 'alphonso', 'runtime_assemble_video', 'assemble'));
    expect(invoke).toHaveBeenCalledWith('content_whisper_words', { request: { workspaceRoot: 'D:\\Content', audioPath: `${dir}/audio/voice-v1/full.wav` } });
    expect(written[`${dir}/output/v1.srt`]).toContain('Hello there.');
    expect(written[`${dir}/output/v1.srt`]).toContain('00:00:00,100');
    expect((result.artifacts[0].data as any).captions).toBe('whisper');
    // No music or B-roll: the pictures (none here) give way to colour cards.
    const spec = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'content_assemble_video')![1] as any;
    expect(spec.spec.music).toBeUndefined();
    expect(spec.spec.scenes[0]).toEqual({ cardColor: '#112233', seconds: 2.5 });
    expect(getProject(project.id)).toBeTruthy();
  });

  // Phase 4a: the brand's font reaches the burned-in captions.
  it("Assemble uses the brand's font and says when it isn't installed", async () => {
    const { brand, project, dir } = setup();
    const withFont = saveBrand({ ...brand, fonts: '"Montserrat", Inter' } as any);
    saveStepVersion(project.id, 'voice', { output: { miya: voiceOutput(dir) }, summary: '', joseCommandId: null });
    backend.media_tools_status = () => ({ whisper: false });
    backend.write_workspace_text_file = () => ({ ok: true });
    backend.content_assemble_video = () => ({ ok: true, outputs: [], fontNote: "The brand font Montserrat isn't installed on this computer; the captions use Arial." });
    const result = await executeMediaStep(assignment(project, withFont, 'alphonso', 'runtime_assemble_video', 'assemble'));
    const sent = vi.mocked(invoke).mock.calls.find((c) => c[0] === 'content_assemble_video')![1] as any;
    expect(sent.spec.font).toBe('Montserrat');
    expect(String((result.artifacts[0].data as any).note)).toContain("isn't installed");
  });
});

