// Making each Short (content factory phase 3d), one at a time after the Shorts step
// saves its plan, through the same commands as the long video:
// - mini-script: its own pictures (ComfyUI), AI clips per the Shorts' own setting
//   (local only here), its own voice-over (Kokoro), captions, the project's music bed,
//   then a 9:16-only assembly;
// - highlight: the hook line spoken (Kokoro) and shown as text, over a part of the
//   finished 9:16 video (`content_cut_short`);
// - cut: that part as it is.
// Files go in `<project>/shorts/<id>/`, each make a new `v<n>` (never overwritten).
import { invoke } from '@tauri-apps/api/core';
import { generateComfyUiImage, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { clipSizeFor, effectiveVideoModel, listVideoModels } from '../videoModelService';
import { getBrand } from './contentBrandService';
import { captionsFromLines, toSrt, alignCaptions } from './contentCaptions';
import { chosenVersionOf, getProject, getShortsSettings, getVideoSettings, setShortOutput } from './contentProjectService';
import { projectRelativeDir, requireOutputRoot, saveProjectImage, writeProjectFile } from './contentProjectFiles';
import { makeComfyClip } from './comfyVideoClip';
import { makeRunwayClip } from './runwayClip';
import { brandFontName, darkestColour, headlineColour } from './thumbnailRenderer';
import type { ContentBrand, ContentProject, ShortPlan } from './contentTypes';

export const MAKING_ANOTHER = 'Making another Short…';
export const NEEDS_FINISHED_VIDEO = 'Make the finished video first: a highlight or a cut is taken from it.';
export const RUNWAY_SHORTS_NOTE = 'Runway clips were not approved; these were made with pictures only.';

export interface ShortOutput {
  shortId: string;
  status: 'done' | 'failed' | 'pending';
  path?: string;
  seconds?: number;
  frames?: string[];
  reason?: string;
  note?: string;
  /** Which file this was (`v<n>.mp4`); Redo makes the next. */
  fileVersion?: number;
}

type Settings = { outputFolder?: string | null };
interface Ctx { project: ContentProject; brand: ContentBrand; root: string; dir: string; n: number; runwayApproved: boolean }
export interface MakeOptions { runwayApproved?: boolean }

// Every make waits for the one before it, so Redo never runs beside another Short (phase 4a).
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/** "done", or "done, N of M failed" when some Shorts failed (phase 4a). */
export function shortsSummary(outputs: Pick<ShortOutput, 'status'>[]): string {
  const failed = outputs.filter((o) => o.status === 'failed').length;
  return failed ? `done, ${failed} of ${outputs.length} failed` : 'done';
}

const hex = (c: string) => (c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`);

function planOf(project: ContentProject): { shorts: ShortPlan[]; made: Record<string, ShortOutput> } {
  const output = chosenVersionOf(project, 'shorts')?.output as { miya?: { shorts?: ShortPlan[] }; made?: Record<string, ShortOutput> } | undefined;
  return { shorts: output?.miya?.shorts || [], made: output?.made || {} };
}

function finishedVertical(project: ContentProject): { path: string; durationSec: number } | null {
  const outputs = (chosenVersionOf(project, 'assemble')?.output as { miya?: { outputs?: { aspect: string; path: string; durationSec?: number }[] } } | undefined)?.miya?.outputs || [];
  const tall = outputs.find((o) => o.aspect === '9x16');
  return tall && typeof tall.durationSec === 'number' ? { path: tall.path, durationSec: tall.durationSec } : null;
}

function musicOf(project: ContentProject): string | undefined {
  return (chosenVersionOf(project, 'music')?.output as { miya?: { path?: string } } | undefined)?.miya?.path || undefined;
}

async function speak(ctx: Ctx, outDir: string, lines: { id: string; text: string }[]) {
  const result = await invoke<{ ok?: boolean; error?: string; full?: { durationSec: number } | null; files?: { id: string; durationSec: number; startSec: number }[] }>(
    'content_tts_kokoro',
    { request: { workspaceRoot: ctx.root, outDir, voiceId: ctx.brand.voice?.voiceId || 'af_heart', lines } },
  );
  if (!result?.ok || !result.full) throw new Error(result?.error || 'Kokoro made no voice-over. Install Kokoro in Runtime Hub.');
  return { full: `${outDir}/full.wav`, durationSec: result.full.durationSec, files: result.files || [] };
}

async function writeText(ctx: Ctx, relativePath: string, content: string): Promise<void> {
  await invoke('write_workspace_text_file', { workspaceRoot: ctx.root, relativePath, content });
}

export const NEEDS_SCRIPT = 'A mini-script Short needs its own script: send it back saying what it should be about, or run the Shorts step again.';

async function makeMini(ctx: Ctx, plan: ShortPlan): Promise<ShortOutput> {
  const parts = plan.parts || [];
  if (!parts.length) return { shortId: plan.id, status: 'failed', reason: NEEDS_SCRIPT };
  const look = [ctx.brand.visualStyle, ctx.brand.characterRefs].filter(Boolean).join(', ');
  const pictures: (string | null)[] = [];
  for (const [i, part] of parts.entries()) {
    const file = `v${ctx.n}-p${i + 1}.png`;
    const result = await generateComfyUiImage(
      { prompt: [part.imagePrompt, look, 'no text, no letters, no words'].filter(Boolean).join('. '), width: 480, height: 832 },
      { endpoint: getComfyUiEndpoint() },
    ).catch(() => null) as { ok?: boolean; previewBase64?: string } | null;
    if (result?.ok && result.previewBase64) {
      await saveProjectImage(ctx.root, ctx.brand, ctx.project, `shorts/${plan.id}`, file, result.previewBase64);
      pictures.push(`${ctx.dir}/${file}`);
    } else pictures.push(null);
  }
  const voice = await speak(ctx, `${ctx.dir}/voice-v${ctx.n}`, parts.map((p, i) => ({ id: `p${i + 1}`, text: p.spoken })));
  const lineSeconds = parts.map((_, i) => voice.files.find((f) => f.id === `p${i + 1}`)?.durationSec ?? 0);

  // AI clips: the Shorts' own setting; on this computer only (Runway needs its own approval).
  const shortsSettings = getShortsSettings(ctx.project);
  const clips: (string | null)[] = parts.map(() => null);
  let note: string | undefined;
  if (shortsSettings.aiClips !== 'none') {
    if (shortsSettings.clipEngine === 'runway') {
      // Approved once for the run (phase 4a), within the one monthly cap.
      if (!ctx.runwayApproved) note = RUNWAY_SHORTS_NOTE;
      else {
        const chosen = shortsSettings.aiClips === 'every' ? parts.map((_, i) => i) : [...new Set([0, parts.length - 1])];
        for (const i of chosen) {
          if (!pictures[i]) continue;
          const made = await makeRunwayClip({
            root: ctx.root, imageRel: pictures[i] as string, outDirRel: `${ctx.dir}/clips`, prompt: parts[i].imagePrompt,
            seconds: Math.min(lineSeconds[i] || 5, 10), vertical: true, model: getVideoSettings(ctx.project).runwayModel,
          }).catch(() => null);
          if (made?.status === 'done' && made.path) clips[i] = made.path;
        }
      }
    } else {
      const info = await listVideoModels().catch(() => null);
      const model = info ? effectiveVideoModel(info) : null;
      if (model?.installed) {
        const size = clipSizeFor(info);
        const chosen = shortsSettings.aiClips === 'every' ? parts.map((_, i) => i) : [...new Set([0, parts.length - 1])];
        for (const i of chosen) {
          if (!pictures[i]) continue;
          const seconds = Math.min(lineSeconds[i] || 3, model.maxSeconds, size.maxSeconds);
          const made = await makeComfyClip({
            root: ctx.root, imageRel: pictures[i] as string, outRel: `${ctx.dir}/clips/v${ctx.n}-p${i + 1}.mp4`,
            prompt: parts[i].imagePrompt, seconds, vertical: true, modelId: model.id, lowRes: size.lowRes,
          }).catch(() => null);
          if (made?.status === 'done' && made.path) clips[i] = made.path;
        }
      }
    }
  }

  const status = await invoke<{ whisper?: boolean }>('media_tools_status').catch(() => ({ whisper: false }));
  let words = captionsFromLines(parts.map((p, i) => {
    const f = voice.files.find((x) => x.id === `p${i + 1}`);
    return { text: p.spoken, start: f?.startSec ?? 0, end: (f?.startSec ?? 0) + (f?.durationSec ?? 0) };
  }));
  if (status?.whisper) {
    const heard = await invoke<{ ok?: boolean; words?: { word: string; start: number; end: number }[] }>('content_whisper_words', {
      request: { workspaceRoot: ctx.root, audioPath: voice.full },
    }).catch(() => null);
    if (heard?.ok && heard.words?.length) words = alignCaptions(parts.flatMap((p) => p.spoken.split(/\s+/).filter(Boolean)), heard.words);
  }
  const srt = `${ctx.dir}/v${ctx.n}.srt`;
  await writeText(ctx, srt, toSrt(words, { maxWords: 6, maxSeconds: 2.5 }));

  const palette = ctx.brand.palette || [];
  const scenes = parts.map((_, i) => {
    const seconds = Math.max(0.5, lineSeconds[i]);
    const first = clips[i] ? { aiClip: clips[i] as string, aiSeconds: Math.min(seconds, 5) } : {};
    return pictures[i] ? { picture: pictures[i] as string, seconds, ...first } : { cardColor: hex(darkestColour(palette)), seconds, ...first };
  });
  const music = musicOf(ctx.project);
  const result = await invoke<{ fontNote?: string | null; outputs?: { aspect: string; path: string; durationSec: number; frames: string[] }[] }>('content_assemble_video', { spec: {
    workspaceRoot: ctx.root, outDir: ctx.dir, version: ctx.n, scenes, voice: voice.full, voiceSeconds: voice.durationSec,
    ...(music ? { music } : {}), srt, captionColor: hex(headlineColour(palette)), outlineColor: hex(darkestColour(palette)),
    aspects: ['9x16'], outputStem: `v${ctx.n}`,
    ...(brandFontName(ctx.brand) ? { font: brandFontName(ctx.brand) } : {}),
  } });
  const out = result?.outputs?.[0];
  if (!out) throw new Error('The Short could not be put together.');
  return {
    shortId: plan.id, status: 'done', path: `${ctx.dir}/${out.path}`, seconds: out.durationSec,
    frames: (out.frames || []).map((f) => `${ctx.dir}/${f}`), fileVersion: ctx.n,
    ...(note || result?.fontNote ? { note: [note, result?.fontNote].filter(Boolean).join(' ') } : {}),
  };
}

async function makeFromVideo(ctx: Ctx, plan: ShortPlan, withHook: boolean): Promise<ShortOutput> {
  const video = finishedVertical(ctx.project);
  if (!video) return { shortId: plan.id, status: 'failed', reason: NEEDS_FINISHED_VIDEO };
  // A Short switched from a mini-script has no part chosen: use the middle of the video.
  const length = Math.min(Math.max(plan.seconds || 45, 3), video.durationSec);
  const middle = Math.max(0, (video.durationSec - length) / 2);
  const moment = plan.moment || { startSec: middle, endSec: middle + length };
  const outPath = `${ctx.dir}/v${ctx.n}.mp4`;
  const palette = ctx.brand.palette || [];
  let hook = {};
  if (withHook && plan.hook) {
    const voice = await speak(ctx, `${ctx.dir}/hook-v${ctx.n}`, [{ id: 'hook', text: plan.hook }]);
    const hookSrt = `${ctx.dir}/hook-v${ctx.n}.srt`;
    await writeText(ctx, hookSrt, toSrt(captionsFromLines([{ text: plan.hook, start: 0, end: voice.durationSec }]), { maxWords: 12, maxSeconds: 60 }));
    hook = { hookVoice: voice.full, hookSeconds: voice.durationSec, hookSrt };
  }
  const result = await invoke<{ ok?: boolean; path?: string; durationSec?: number; frames?: string[]; fontNote?: string | null }>('content_cut_short', { spec: {
    workspaceRoot: ctx.root, source: video.path, sourceSeconds: video.durationSec, startSec: moment.startSec, endSec: moment.endSec,
    outPath, captionColor: hex(headlineColour(palette)), outlineColor: hex(darkestColour(palette)), ...hook,
    ...(brandFontName(ctx.brand) ? { font: brandFontName(ctx.brand) } : {}),
  } });
  if (!result?.ok) throw new Error('The Short could not be cut from the finished video.');
  return {
    shortId: plan.id, status: 'done', path: outPath, seconds: result.durationSec,
    frames: (result.frames || []).map((f) => `${ctx.dir}/${f}`), fileVersion: ctx.n,
    ...(result.fontNote ? { note: result.fontNote } : {}),
  };
}

async function makeOne(projectId: string, plan: ShortPlan, settings: Settings, options: MakeOptions = {}): Promise<ShortOutput> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const brand = getBrand(project.brandId);
  if (!brand) throw new Error("This project's brand no longer exists.");
  const root = requireOutputRoot(settings);
  const previous = planOf(project).made[plan.id];
  const ctx: Ctx = { project, brand, root, dir: `${projectRelativeDir(brand, project)}/shorts/${plan.id}`, n: (previous?.fileVersion || 0) + 1, runwayApproved: options.runwayApproved === true };
  let output: ShortOutput;
  try {
    output = plan.kind === 'mini' ? await makeMini(ctx, plan) : await makeFromVideo(ctx, plan, plan.kind === 'highlight');
  } catch (error) {
    output = { shortId: plan.id, status: 'failed', reason: error instanceof Error ? error.message : String(error), ...(previous?.fileVersion ? { fileVersion: previous.fileVersion } : {}) };
  }
  const saved = setShortOutput(projectId, plan.id, output);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return output;
}

/** Makes every planned Short in turn; one failing does not stop the others. */
export async function makeShorts(projectId: string, settings: Settings, onProgress?: (m: string) => void, options: MakeOptions = {}): Promise<ShortOutput[]> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const { shorts } = planOf(project);
  return inTurn(async () => {
    const outputs: ShortOutput[] = [];
    for (const [i, plan] of shorts.entries()) {
      onProgress?.(`Making Short ${i + 1} of ${shorts.length}…`);
      outputs.push(await makeOne(projectId, plan, settings, options));
    }
    return outputs;
  });
}

/** Makes one Short again (a new `v<n>` file), after any Short being made now. */
export async function redoShort(projectId: string, shortId: string, settings: Settings): Promise<ShortOutput | { ok: false; reason: string }> {
  return inTurn(async () => {
    const project = getProject(projectId);
    const plan = project ? planOf(project).shorts.find((s) => s.id === shortId) : undefined;
    if (!plan) return { ok: false as const, reason: 'That Short is not in the chosen Shorts.' };
    return makeOne(projectId, plan, settings);
  });
}
