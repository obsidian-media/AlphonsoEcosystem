// Video and music asked for in Chat (closing phase, owner 2026-10-30): one Miya step makes them on
// this computer, a ComfyUI picture turned into a clip by the installed video model, or AudioCraft's
// music; nothing starts when the tool isn't installed.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const submitStepsToJose = vi.fn(async () => ({ ok: true }));
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: (...a: unknown[]) => submitStepsToJose(...(a as [])) }));
const generateComfyUiImage = vi.fn();
vi.mock('../../../services/connectors/connectorImageGenerators', () => ({
  generateComfyUiImage: (...a: unknown[]) => generateComfyUiImage(...a),
  getComfyUiEndpoint: () => 'http://127.0.0.1:8188',
}));
const makeComfyClip = vi.fn();
const checkComfyClip = vi.fn();
vi.mock('../../../services/contentFactory/comfyVideoClip', () => ({
  makeComfyClip: (...a: unknown[]) => makeComfyClip(...a),
  checkComfyClip: (...a: unknown[]) => checkComfyClip(...a),
}));
const videoInfo = { models: [{ id: 'ltx_video_2b', name: 'LTX-Video', maxSeconds: 5, installed: true }], suggested: 'ltx_video_2b', smallCard: false };
const listVideoModels = vi.fn(async () => videoInfo);
vi.mock('../../../services/videoModelService', async () => {
  const actual = await vi.importActual<typeof import('../../../services/videoModelService')>('../../../services/videoModelService');
  return { ...actual, listVideoModels: () => listVideoModels() };
});
vi.mock('../../../services/contentFactory/contentStepRecorder', () => ({ contentAppSettings: () => ({ outputFolder: (globalThis as { __outputFolder?: string }).__outputFolder ?? 'D:/Content' }) }));
vi.mock('../../../services/jose/joseRequestStore', () => ({ findRequestByPacket: () => ({ source: 'user' }) }));

const {
  chatMediaKindOf, askChatMedia, executeChatMedia, executeChatPicture, chatMediaFor, checkChatMedia, listChatMedia,
  NO_VIDEO_MODEL, NO_AUDIOCRAFT, CHAT_MEDIA_LABEL,
} = await import('../../../services/contentFactory/chatMedia');

const videoStep = (prompt = 'a cat on a boat') => ({ agent: 'miya', actionType: 'creative_chat_video', effects: ['write_own_work'], payload: { kind: 'video' as const, prompt } });
const musicStep = (prompt = 'calm piano') => ({ agent: 'miya', actionType: 'creative_chat_music', effects: ['write_own_work'], payload: { kind: 'music' as const, prompt } });

beforeEach(() => {
  localStorage.clear();
  for (const f of [invoke, submitStepsToJose, generateComfyUiImage, makeComfyClip, checkComfyClip, listVideoModels]) f.mockClear();
  listVideoModels.mockImplementation(async () => videoInfo);
  invoke.mockImplementation(async (cmd: string, args: { folder?: string; filename?: string }) => {
    if (cmd === 'media_tools_status') return { audiocraft: true };
    if (cmd === 'save_image_to_folder') return { path: `${args.folder}/${args.filename}` };
    if (cmd === 'content_music_generate') return { ok: true };
    return { ok: true };
  });
  generateComfyUiImage.mockResolvedValue({ ok: true, previewBase64: 'PIC' });
  makeComfyClip.mockResolvedValue({ status: 'done' });
});

describe('chatMediaKindOf', () => {
  it('reads a video or music request, not a picture or Higgsfield', () => {
    expect(chatMediaKindOf('make a video of a cat on a boat')).toBe('video');
    expect(chatMediaKindOf('create a music track for my intro')).toBe('music');
    expect(chatMediaKindOf('draw a picture of a cat')).toBeNull();
    expect(chatMediaKindOf('make a Higgsfield video of a cat')).toBeNull();
  });

  it('a script, outline or ideas for a video is writing, not a video to make', () => {
    expect(chatMediaKindOf('make a video script about home coffee')).toBeNull();
    expect(chatMediaKindOf('create video ideas for my channel')).toBeNull();
    expect(chatMediaKindOf('make lyrics for a song about rain')).toBeNull();
  });
});

describe('askChatMedia', () => {
  it('a video starts one Miya step that writes its own work', async () => {
    await askChatMedia({ text: 'make a video of a cat on a boat', source: 'user' });
    expect(submitStepsToJose).toHaveBeenCalledTimes(1);
    const input = (submitStepsToJose.mock.calls[0] as unknown as [{ steps: unknown[]; label: string }])[0];
    expect(input.label).toBe(CHAT_MEDIA_LABEL);
    expect(input.steps).toEqual([expect.objectContaining({ agent: 'miya', actionType: 'creative_chat_video', effects: ['write_own_work'], payload: { kind: 'video', prompt: 'a cat on a boat' } })]);
  });

  it('without an installed video model it says what to install and starts nothing', async () => {
    listVideoModels.mockResolvedValue({ ...videoInfo, models: [{ ...videoInfo.models[0], installed: false }] });
    const r = await askChatMedia({ text: 'make a video of a cat', source: 'user' });
    expect(r).toMatchObject({ ok: false, reason: NO_VIDEO_MODEL });
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });

  it('without AudioCraft, music says what to install and starts nothing', async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === 'media_tools_status' ? { audiocraft: false } : { ok: true }));
    const r = await askChatMedia({ text: 'create a music track for my intro', source: 'user' });
    expect(r).toMatchObject({ ok: false, reason: NO_AUDIOCRAFT });
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });

  it('leaves other requests alone', async () => {
    expect(await askChatMedia({ text: 'what is the weather', source: 'user' })).toBeNull();
  });
});

describe('executeChatMedia', () => {
  it('a video: a ComfyUI picture, then a clip from it with the installed model, saved under Miya/<date>/', async () => {
    const out = await executeChatMedia(videoStep(), { id: 'p1', commandId: 'c1' });
    expect(out.resultState).toBe('completed');
    expect(generateComfyUiImage.mock.calls[0][0]).toMatchObject({ prompt: 'a cat on a boat' });
    const clip = makeComfyClip.mock.calls[0][0] as { root: string; imageRel: string; outRel: string; modelId: string; seconds: number };
    expect(clip.root).toBe('D:/Content');
    expect(clip.imageRel).toMatch(/^Miya\/\d{4}-\d{2}-\d{2}\/video-\d{6}-[0-9a-f]{8}\.png$/);
    expect(clip.outRel).toBe(clip.imageRel.replace(/\.png$/, '.mp4'));
    expect(clip.modelId).toBe('ltx_video_2b');
    expect(clip.seconds).toBe(5);
    expect(chatMediaFor('c1')).toEqual([expect.objectContaining({ kind: 'video', path: clip.outRel, status: 'done' })]);
  });

  it('a clip still being made is kept and picked up by Check again', async () => {
    makeComfyClip.mockResolvedValue({ status: 'pending', jobId: 'job-9' });
    await executeChatMedia(videoStep(), { id: 'p1', commandId: 'c2' });
    const [kept] = listChatMedia();
    expect(kept).toMatchObject({ status: 'pending', jobId: 'job-9' });
    checkComfyClip.mockResolvedValue({ status: 'done' });
    const checked = await checkChatMedia(kept.id);
    expect(checkComfyClip).toHaveBeenCalledWith('job-9', kept.path, 'D:/Content');
    expect(checked?.status).toBe('done');
  });

  it('music: AudioCraft writes a WAV under Miya/<date>/', async () => {
    const out = await executeChatMedia(musicStep(), { id: 'p1', commandId: 'c3' });
    expect(out.resultState).toBe('completed');
    const call = invoke.mock.calls.find((c) => c[0] === 'content_music_generate')![1] as { request: { workspaceRoot: string; outPath: string; prompt: string; seconds: number } };
    expect(call.request).toMatchObject({ workspaceRoot: 'D:/Content', prompt: 'calm piano', seconds: 30 });
    expect(call.request.outPath).toMatch(/^Miya\/\d{4}-\d{2}-\d{2}\/music-\d{6}-[0-9a-f]{8}\.wav$/);
  });

  it('a failed picture fails the video step with the reason', async () => {
    generateComfyUiImage.mockResolvedValue({ ok: false, error: 'ComfyUI is not running' });
    const out = await executeChatMedia(videoStep(), { id: 'p1', commandId: 'c4' });
    expect(out.resultState).toBe('failed');
    expect(out.summary).toMatch(/ComfyUI is not running/);
    expect(makeComfyClip).not.toHaveBeenCalled();
  });
});

// Owner, 2026-11-01: a picture asked for in Chat stayed in ComfyUI's own folder, and Chat
// said nothing about where. Like videos, it is saved under <output folder>/Miya/<date>/ and shown.
describe('executeChatPicture', () => {
  const pictureStep = { agent: 'miya', actionType: 'creative_image', effects: ['write_own_work'] };

  it('saves the picture under Miya/<date>/ in the output folder, says where, and lists it for Chat', async () => {
    const r = await executeChatPicture('a sunset over mountains', pictureStep, { id: 'pk-1', commandId: 'cmd-1' });
    expect(r.resultState).toBe('completed');
    const save = invoke.mock.calls.find((c) => c[0] === 'save_image_to_folder');
    expect(save?.[1]).toMatchObject({ base64Data: 'PIC' });
    expect(String(save?.[1].folder)).toMatch(/^D:\/Content\/Miya\/\d{4}-\d{2}-\d{2}$/);
    expect(String(save?.[1].filename)).toMatch(/^picture-\d{6}-[0-9a-f]{8}\.png$/);
    const path = `Miya/${String(save?.[1].folder).split('/').pop()}/${save?.[1].filename}`;
    expect(r.summary).toBe(`Miya: made the picture (${path}).`);
    expect(r.artifacts[0]).toMatchObject({ path, relativePath: path });
    expect(chatMediaFor('cmd-1')).toEqual([expect.objectContaining({ kind: 'picture', path, prompt: 'a sunset over mountains', status: 'done' })]);
  });

  it('without an output folder it fails and says to choose one; nothing is made', async () => {
    (globalThis as { __outputFolder?: string }).__outputFolder = '';
    try {
      const r = await executeChatPicture('a sunset', pictureStep, null);
      expect(r.resultState).toBe('failed');
      expect(r.summary).toContain('output folder');
      expect(generateComfyUiImage).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as { __outputFolder?: string }).__outputFolder;
    }
  });

  it('a picture ComfyUI is still making says so and saves nothing yet', async () => {
    generateComfyUiImage.mockResolvedValue({ ok: false, pending: true, jobId: 'job-9' });
    const r = await executeChatPicture('a sunset', pictureStep, null);
    expect(r.resultState).toBe('pending_review');
    expect(r.summary).toContain('still being made in ComfyUI');
    expect(invoke.mock.calls.some((c) => c[0] === 'save_image_to_folder')).toBe(false);
  });
});
