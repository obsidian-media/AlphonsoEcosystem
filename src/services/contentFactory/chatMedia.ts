// Video and music asked for in Chat, Telegram or the board (closing phase, owner 2026-10-30).
// One Miya step (`creative_chat_video` / `creative_chat_music`, `write_own_work`) makes them on
// this computer: a video is a ComfyUI picture turned into a clip by the installed video model
// (Runtime Hub → ComfyUI → Video models), music is AudioCraft's. They are saved in
// `<output folder>/Miya/<date>/`, shown in Chat and sent on Telegram. When the tool isn't
// installed, the request says what to install and nothing starts.
import { invoke } from '@tauri-apps/api/core';
import { generateComfyUiImage, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { detectCreativeIntent } from '../creativeRoutingService';
import { agentName } from '../jose/agentNames';
import { findRequestByPacket } from '../jose/joseRequestStore';
import type { PlanStep } from '../jose/stepGraph';
import { submitStepsToJose } from '../jose/submitToJose';
import { clipSizeFor, effectiveVideoModel, listVideoModels } from '../videoModelService';
import { randomHex } from '../../lib/randomId';
import { checkComfyClip, makeComfyClip } from './comfyVideoClip';
import { requireOutputRoot } from './contentProjectFiles';
import { contentAppSettings } from './contentStepRecorder';

export const CHAT_MEDIA_LABEL = 'Video or music asked for.';
export const NO_VIDEO_MODEL = 'No video model is installed: install one in Runtime Hub → ComfyUI → Video models. Nothing was started.';
export const NO_AUDIOCRAFT = 'AudioCraft is not installed: install it in Runtime Hub to make music. Nothing was started.';
/** How long a clip asked for in Chat is, at most (the video models make 5 s at most). */
export const CHAT_CLIP_SECONDS = 5;
/** How long a piece of music asked for in Chat is. */
export const CHAT_MUSIC_SECONDS = 30;

const STORE_KEY = 'alphonso_chat_media_v1';
const KEEP = 100;

export type ChatMediaKind = 'video' | 'music' | 'picture';

export interface ChatMediaResult {
  id: string;
  kind: ChatMediaKind;
  prompt: string;
  /** Relative to the output folder. */
  path: string;
  status: 'done' | 'pending';
  atMs: number;
  /** A clip still in ComfyUI. */
  jobId?: string;
  commandId?: string;
  shownInChat?: boolean;
}

/** Words about a video or song that make the request writing, not media to make. */
const WRITING = /\b(scripts?|outlines?|ideas?|lyrics|titles?|descriptions?|captions?|storyboards?|plans?)\b/i;

/** 'video' or 'music' when the text asks for one made (not by Higgsfield, not a picture). */
export function chatMediaKindOf(text: string): ChatMediaKind | null {
  if (WRITING.test(text)) return null;
  const intent = detectCreativeIntent(text);
  return intent === 'video_generation' ? 'video' : intent === 'audio_generation' ? 'music' : null;
}

/** What to make: the words after "… video/music of/about", else the whole request. */
export function chatMediaPromptOf(text: string): string {
  const match = /\b(?:video|clip|reel|animation|film|music|song|soundtrack|audio|track)s?\b\s*(?:of|about|showing|with|for|:)\s*(.+)$/i.exec(text.trim());
  return (match?.[1] || text).trim().replace(/[.!?]+$/, '').slice(0, 1000);
}

async function installedVideoModel(): Promise<{ id: string; seconds: number; lowRes: boolean } | null> {
  const info = await listVideoModels().catch(() => null);
  const model = info ? effectiveVideoModel(info) : null;
  if (!info || !model?.installed) return null;
  const size = clipSizeFor(info);
  return { id: model.id, seconds: Math.min(CHAT_CLIP_SECONDS, model.maxSeconds || CHAT_CLIP_SECONDS, size.maxSeconds), lowRes: size.lowRes };
}

async function audiocraftInstalled(): Promise<boolean> {
  const status = await invoke<{ audiocraft?: boolean }>('media_tools_status').catch(() => null);
  return status?.audiocraft === true;
}

/** Plans the request as one Miya step, or says what to install; nothing starts without the tool. */
export async function askChatMedia(input: { text: string; source: string; onProgress?: (event: unknown) => void }): Promise<any> {
  const kind = chatMediaKindOf(input.text);
  if (!kind) return null;
  const missing = kind === 'video' ? (await installedVideoModel() ? null : NO_VIDEO_MODEL) : (await audiocraftInstalled() ? null : NO_AUDIOCRAFT);
  if (missing) return { ok: false, reason: missing, plan: null, planNote: missing };
  const prompt = chatMediaPromptOf(input.text);
  const step: PlanStep = {
    stepId: 'miya', agent: 'miya', actionType: kind === 'video' ? 'creative_chat_video' : 'creative_chat_music', effects: ['write_own_work'], needs: [],
    instruction: `Make ${kind === 'video' ? 'a video' : 'music'}: ${prompt}`, payload: { kind, prompt },
  } as PlanStep;
  return submitStepsToJose({ text: input.text, source: input.source, steps: [step], label: CHAT_MEDIA_LABEL, saveDecisions: false, onProgress: input.onProgress as never });
}

export function listChatMedia(): ChatMediaResult[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveResult(result: ChatMediaResult): void {
  const rest = listChatMedia().filter((r) => r.id !== result.id);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([result, ...rest].slice(0, KEEP)));
  } catch {
    // The file is still in the folder.
  }
}

/** Done results made since a time and not yet shown in Chat. */
export function chatMediaDoneSince(sinceMs: number): ChatMediaResult[] {
  return listChatMedia().filter((r) => r.status === 'done' && r.atMs >= sinceMs && !r.shownInChat);
}

export function markChatMediaShown(id: string): void {
  const found = listChatMedia().find((r) => r.id === id);
  if (found) saveResult({ ...found, shownInChat: true });
}

/** Results of one Jose command (Chat shows them under its reply). */
export function chatMediaFor(commandId: string | null | undefined): ChatMediaResult[] {
  return commandId ? listChatMedia().filter((r) => r.commandId === commandId && r.status === 'done') : [];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `<Miya>/<date>/<kind>-<HHMMSS>-<hex>`, without its extension. */
function outStem(kind: ChatMediaKind, now = new Date()): string {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${agentName('miya')}/${day}/${kind}-${time}-${randomHex(8)}`;
}

function stepResult(assignment: { agent: string; actionType: string }, state: 'completed' | 'failed' | 'pending_review', summary: string, path?: string, data?: unknown) {
  return {
    summary: `${agentName(assignment.agent)}: ${summary}`,
    resultState: state,
    artifacts: [{ type: 'chat_media', actionType: assignment.actionType, ...(path ? { path, relativePath: path } : {}), data: data ?? null, raw: '' }],
    sources: [],
    contractAction: assignment.actionType,
    ...(state === 'failed' ? { failureReason: summary } : {}),
  };
}

async function tellTelegram(packet: { id?: string } | null, root: string, result: ChatMediaResult): Promise<void> {
  const source = packet?.id ? findRequestByPacket(packet.id)?.source : null;
  if (source !== 'telegram') return;
  const { sendTelegramFileOrFolder } = await import('../telegramCompanionService');
  await sendTelegramFileOrFolder({ root, relativePath: result.path, caption: `Your ${result.kind}: ${result.prompt}` }).catch(() => undefined);
}

/** Miya's step: makes the video or music on this computer. */
export async function executeChatMedia(
  assignment: { agent: string; actionType: string; payload?: { kind?: ChatMediaKind; prompt?: string } },
  packet: { id?: string; commandId?: string } | null,
): Promise<ReturnType<typeof stepResult>> {
  const kind: ChatMediaKind = assignment.payload?.kind === 'music' || assignment.actionType === 'creative_chat_music' ? 'music' : 'video';
  const prompt = String(assignment.payload?.prompt || '').trim();
  let root: string;
  try {
    root = requireOutputRoot(contentAppSettings());
  } catch (error) {
    return stepResult(assignment, 'failed', (error as Error).message);
  }
  const stem = outStem(kind);
  const base = { id: `media-${Date.now()}-${randomHex(4)}`, kind, prompt, atMs: Date.now(), ...(packet?.commandId ? { commandId: packet.commandId } : {}) };

  if (kind === 'music') {
    const path = `${stem}.wav`;
    const answer = await invoke<{ ok?: boolean; missing?: boolean; error?: string }>('content_music_generate', {
      request: { workspaceRoot: root, outPath: path, prompt, seconds: CHAT_MUSIC_SECONDS },
    }).catch((error): { ok?: boolean; missing?: boolean; error?: string } => ({ ok: false, error: (error as Error)?.message || String(error) }));
    if (answer?.missing) return stepResult(assignment, 'failed', NO_AUDIOCRAFT);
    if (!answer?.ok) return stepResult(assignment, 'failed', `couldn't make the music: ${answer?.error || 'AudioCraft made nothing'}`);
    const saved: ChatMediaResult = { ...base, path, status: 'done' };
    saveResult(saved);
    await tellTelegram(packet, root, saved);
    return stepResult(assignment, 'completed', `made the music (${path}).`, path, { kind, prompt });
  }

  const model = await installedVideoModel();
  if (!model) return stepResult(assignment, 'failed', NO_VIDEO_MODEL);
  const picture = await generateComfyUiImage({ prompt, width: 832, height: 480 }, { endpoint: getComfyUiEndpoint() }).catch((error: Error) => ({ ok: false, error: error.message })) as { ok?: boolean; previewBase64?: string; error?: string };
  if (!picture?.ok || !picture.previewBase64) return stepResult(assignment, 'failed', `couldn't make the video's first picture: ${picture?.error || 'ComfyUI gave no picture'}`);
  const imageRel = `${stem}.png`;
  const folder = `${root.replace(/[\\/]+$/, '')}/${imageRel.slice(0, imageRel.lastIndexOf('/'))}`;
  await invoke('save_image_to_folder', { base64Data: picture.previewBase64, filename: imageRel.slice(imageRel.lastIndexOf('/') + 1), folder });
  const path = `${stem}.mp4`;
  const clip = await makeComfyClip({ root, imageRel, outRel: path, prompt, seconds: model.seconds, vertical: false, modelId: model.id, lowRes: model.lowRes });
  if (clip.status === 'pending' && clip.jobId) {
    saveResult({ ...base, path, status: 'pending', jobId: clip.jobId });
    return stepResult(assignment, 'completed', 'the video is still being made in ComfyUI; Check again in Miya Studio → Quick package.', undefined, { kind, prompt, jobId: clip.jobId });
  }
  if (clip.status !== 'done') return stepResult(assignment, 'failed', `couldn't make the video: ${clip.error || 'ComfyUI made no clip'}`);
  const saved: ChatMediaResult = { ...base, path, status: 'done' };
  saveResult(saved);
  await tellTelegram(packet, root, saved);
  return stepResult(assignment, 'completed', `made the video (${path}).`, path, { kind, prompt });
}

/** Miya's picture asked for in words (owner, 2026-11-01): made by ComfyUI, then saved under
 *  `<output folder>/Miya/<date>/` like a video, so Chat shows it and says where it is. Until then it
 *  stayed in ComfyUI's own output folder and nothing said so. */
export async function executeChatPicture(
  prompt: string,
  assignment: { agent: string; actionType: string },
  packet: { id?: string; commandId?: string } | null,
): Promise<ReturnType<typeof stepResult>> {
  let root: string;
  try {
    root = requireOutputRoot(contentAppSettings());
  } catch (error) {
    return stepResult(assignment, 'failed', (error as Error).message);
  }
  const image = await generateComfyUiImage({ prompt, width: 512, height: 512, steps: 20, cfgScale: 7 }, { endpoint: getComfyUiEndpoint() })
    .catch((error: Error) => ({ ok: false, error: error.message })) as { ok?: boolean; pending?: boolean; jobId?: string; previewBase64?: string; error?: string; message?: string };
  if (image?.pending) return stepResult(assignment, 'pending_review', 'the picture is still being made in ComfyUI.', undefined, { kind: 'picture', prompt, jobId: image.jobId });
  if (!image?.ok || !image.previewBase64) return stepResult(assignment, 'failed', `couldn't make the picture: ${image?.error || image?.message || 'ComfyUI gave no picture'}`);
  const path = `${outStem('picture')}.png`;
  const folder = `${root.replace(/[\\/]+$/, '')}/${path.slice(0, path.lastIndexOf('/'))}`;
  await invoke('save_image_to_folder', { base64Data: image.previewBase64, filename: path.slice(path.lastIndexOf('/') + 1), folder });
  const saved: ChatMediaResult = { id: `media-${Date.now()}-${randomHex(4)}`, kind: 'picture', prompt, atMs: Date.now(), path, status: 'done', ...(packet?.commandId ? { commandId: packet.commandId } : {}) };
  saveResult(saved);
  await tellTelegram(packet, root, saved);
  return stepResult(assignment, 'completed', `made the picture (${path}).`, path, { kind: 'picture', prompt });
}

/** Quick package's Check again: one look at a clip still in ComfyUI; never a new run. */
export async function checkChatMedia(id: string): Promise<ChatMediaResult | null> {
  const result = listChatMedia().find((r) => r.id === id);
  if (!result || result.status !== 'pending' || !result.jobId) return result || null;
  const root = requireOutputRoot(contentAppSettings());
  const clip = await checkComfyClip(result.jobId, result.path, root).catch(() => null);
  if (clip?.status === 'done') {
    const done: ChatMediaResult = { ...result, status: 'done' };
    saveResult(done);
    return done;
  }
  return result;
}
