// The steps that make a project's finished video (Miya content factory phase
// 2a): Voice (Kokoro), Music (MusicGen), B-roll (stock footage) and Assemble
// (ffmpeg). Run by Jose like the other content steps; each returns the data
// the recorder saves as the step's version. Every file goes in the project
// folder; nothing is overwritten, since each version has its own names.
// Design: docs/superpowers/specs/2026-10-23-miya-content-factory-phase2a-design.md
import { invoke } from '@tauri-apps/api/core';
import { freeOllamaGpuMemory, generateAgentLlmResponse } from '../../lib/ollama';
import { getConnectorCredential } from '../connectors/connectorAuth';
import { configuredStockSources, searchStockClips } from '../connectors/stockFootageConnector';
import { getBrand } from './contentBrandService';
import { alignCaptions, captionsFromLines, toSrt } from './contentCaptions';
import { isVerticalOnly } from './contentImages';
import { chosenVersionOf, getProject } from './contentProjectService';
import { projectRelativeDir, requireOutputRoot } from './contentProjectFiles';
import { priorOutputs } from './contentStepAgents';
import { contentAppSettings } from './contentStepRecorder';
import { darkestColour, headlineColour } from './thumbnailRenderer';
import type { ContentBrand, ContentProject, StepId } from './contentTypes';
import type { ContentStepResult } from './contentAgentExecutor';

export const MEDIA_ACTIONS = new Set(['creative_voice', 'creative_music', 'research_broll', 'runtime_assemble_video']);

export const NO_STOCK_KEYS = 'No stock footage keys are set. Add a free Pexels, Pixabay or Coverr key in Connectors → Content & Productivity to use stock clips; the scene pictures are used instead.';
export const NO_VOICE = 'Run the Voice step first.';
const NO_WHISPER_NOTE = 'Whisper is not installed, so each caption line is timed by its sentence, not word by word. Install Whisper in Runtime Hub for word timing.';
const UNREADABLE_MOOD = "Miya's model gave no music description that could be read. Choose a larger model for Miya in Settings → Connectors → Agent Providers, then Retry.";

interface MediaAssignment {
  agent: string;
  actionType: string;
  contentStep: { projectId: string; step: StepId };
}

interface ScriptPart { startSec?: number; endSec?: number; spoken?: string; music?: string }
interface Scene { id: string; startSec?: number; endSec?: number; description?: string }
export interface VoiceLine { sceneId: string; text: string; startSec: number; endSec: number; path: string | null }
export interface VoiceOutput { full: string; durationSec: number; lines: VoiceLine[] }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function done(assignment: MediaAssignment, data: unknown, summary: string): ContentStepResult {
  return {
    summary,
    resultState: 'completed',
    artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data, raw: '' }],
    sources: [],
    contractAction: assignment.actionType,
  };
}

function failed(assignment: MediaAssignment, reason: string): ContentStepResult {
  return {
    summary: `${assignment.agent}: ${reason}`,
    resultState: 'failed',
    artifacts: [{ type: 'content_step_output', actionType: assignment.actionType, data: null, raw: '' }],
    sources: [],
    contractAction: assignment.actionType,
    failureReason: reason,
  };
}

interface Context {
  project: ContentProject;
  brand: ContentBrand;
  root: string;
  dir: string;
  /** The version this run will be saved as (files are named after it). */
  version: number;
  prior: Partial<Record<StepId, unknown>>;
}

function context(assignment: MediaAssignment): Context {
  const { projectId, step } = assignment.contentStep;
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const brand = getBrand(project.brandId);
  if (!brand) throw new Error("This project's brand no longer exists.");
  const root = requireOutputRoot(contentAppSettings());
  const versions = project.steps[step]?.versions || [];
  return {
    project, brand, root,
    dir: projectRelativeDir(brand, project),
    version: (versions[versions.length - 1]?.version || 0) + 1,
    prior: priorOutputs(project, step),
  };
}

/** One agent's part of a step's saved output (`{ miya: … }`). */
function part<T>(prior: Partial<Record<StepId, unknown>>, step: StepId, agent: string): T | undefined {
  return (prior[step] as Record<string, T> | undefined)?.[agent];
}

function scriptParts(ctx: Context): ScriptPart[] {
  return part<{ script?: ScriptPart[] }>(ctx.prior, 'script', 'miya')?.script || [];
}

function scenesOf(ctx: Context): Scene[] {
  return part<{ scenes?: Scene[] }>(ctx.prior, 'scenes', 'miya')?.scenes || [];
}

/** The spoken words of each scene, by where each part of the script falls. */
export function linesForScenes(parts: ScriptPart[], scenes: Scene[]): { id: string; text: string; seconds: number }[] {
  if (scenes.length === 0) {
    return parts.map((p, i) => ({ id: `p${i + 1}`, text: String(p.spoken || '').trim(), seconds: Math.max(1, (num(p.endSec) ?? 0) - (num(p.startSec) ?? 0)) }));
  }
  const timed = scenes.every((s) => num(s.startSec) !== null && num(s.endSec) !== null);
  const texts: string[][] = scenes.map(() => []);
  parts.forEach((p, i) => {
    let index = Math.min(scenes.length - 1, Math.floor((i * scenes.length) / Math.max(1, parts.length)));
    const start = num(p.startSec);
    const end = num(p.endSec);
    if (timed && start !== null && end !== null) {
      const mid = (start + end) / 2;
      const found = scenes.findIndex((s) => mid >= (s.startSec as number) && mid < (s.endSec as number));
      index = found >= 0 ? found : (mid >= (scenes[scenes.length - 1].endSec as number) ? scenes.length - 1 : 0);
    }
    const spoken = String(p.spoken || '').trim();
    if (spoken) texts[index].push(spoken);
  });
  return scenes.map((s, i) => ({
    id: s.id,
    text: texts[i].join(' '),
    seconds: Math.max(1, timed ? (s.endSec as number) - (s.startSec as number) : 3),
  }));
}

async function runVoice(assignment: MediaAssignment, ctx: Context): Promise<ContentStepResult> {
  const lines = linesForScenes(scriptParts(ctx), scenesOf(ctx));
  if (!lines.some((l) => l.text)) return failed(assignment, 'The script has no spoken words to read. Run the Script step first.');
  const outDir = `${ctx.dir}/audio/voice-v${ctx.version}`;
  const result = await invoke<{ ok?: boolean; error?: string; full?: { durationSec: number } | null; files?: { id: string; path: string | null; durationSec: number; startSec: number }[] }>(
    'content_tts_kokoro',
    { request: {
      workspaceRoot: ctx.root, outDir, voiceId: ctx.brand.voice?.voiceId || 'af_heart',
      lines: lines.map((l) => (l.text ? { id: l.id, text: l.text } : { id: l.id, text: '', pauseSec: l.seconds })),
    } },
  );
  if (!result?.ok || !result.full) return failed(assignment, result?.error || 'Kokoro made no voice-over.');
  const files = result.files || [];
  const output: VoiceOutput = {
    full: `${outDir}/full.wav`,
    durationSec: result.full.durationSec,
    lines: lines.map((l) => {
      const f = files.find((x) => x.id === l.id);
      const startSec = f?.startSec ?? 0;
      return { sceneId: l.id, text: l.text, startSec, endSec: startSec + (f?.durationSec ?? 0), path: f?.path ? `${outDir}/${l.id}.wav` : null };
    }),
  };
  return done(assignment, output, `Voice-over read in ${ctx.brand.voice?.voiceId || 'af_heart'}, ${output.durationSec.toFixed(1)} s.`);
}

async function moodPrompt(ctx: Context): Promise<string | null> {
  const cues = scriptParts(ctx).map((p) => p.music).filter(Boolean).join('; ');
  const prompt = [
    'Write one short description of background music for this video, for a music generator (instruments, mood, tempo). No lyrics, no artist names.',
    `Idea: ${ctx.project.brief.idea}`,
    `Brand tone: ${ctx.brand.tone || 'not set'}`,
    cues ? `Music cues in the script: ${cues}` : '',
    'Return only JSON: {"prompt":"the music description"}',
  ].filter(Boolean).join('\n');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await generateAgentLlmResponse('miya', { prompt, format: 'json', sessionId: `content:${ctx.project.id}:music` });
    try {
      const text = String(JSON.parse(String(reply?.response || '{}'))?.prompt || '').trim();
      if (text) return text.slice(0, 300);
    } catch {
      // Asked once more below.
    }
  }
  return null;
}

export const NO_AUDIOCRAFT = 'AudioCraft is not installed. Install it in Runtime Hub to add music.';

async function runMusic(assignment: MediaAssignment, ctx: Context): Promise<ContentStepResult> {
  // Checked first, so a computer without AudioCraft spends no model call on a mood.
  const status = await invoke<{ audiocraft?: boolean }>('media_tools_status').catch(() => null);
  if (status && status.audiocraft === false) return done(assignment, { skipped: NO_AUDIOCRAFT }, 'Music skipped: AudioCraft is not installed.');
  const prompt = await moodPrompt(ctx);
  if (!prompt) return failed(assignment, UNREADABLE_MOOD);
  const lastEnd = Math.max(0, ...scriptParts(ctx).map((p) => num(p.endSec) ?? 0));
  const seconds = Math.min(300, Math.max(5, Math.ceil((lastEnd || ctx.project.brief.lengthSec || 30) + 2)));
  // MusicGen needs the graphics card that Ollama is holding.
  await freeOllamaGpuMemory().catch(() => undefined);
  const outPath = `${ctx.dir}/audio/music-v${ctx.version}.wav`;
  const result = await invoke<{ ok?: boolean; missing?: boolean; error?: string }>('content_music_generate', {
    request: { workspaceRoot: ctx.root, outPath, prompt, seconds },
  });
  if (result?.missing) return done(assignment, { skipped: result.error }, 'Music skipped: AudioCraft is not installed.');
  if (!result?.ok) return failed(assignment, result?.error || 'MusicGen made no music.');
  return done(assignment, { path: outPath, prompt, seconds }, `Music: ${prompt}`);
}

const STOP_WORDS = new Set(['the', 'and', 'with', 'from', 'that', 'this', 'into', 'onto', 'over', 'their', 'there', 'about', 'while', 'shows', 'show', 'scene']);

function searchWords(text: string): string {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w)).slice(0, 6).join(' ');
}

async function runBroll(assignment: MediaAssignment, ctx: Context): Promise<ContentStepResult> {
  if (configuredStockSources().length === 0) return done(assignment, { skipped: NO_STOCK_KEYS }, 'B-roll skipped: no stock footage keys.');
  const orientation = isVerticalOnly(ctx.project.brief) ? 'portrait' : 'landscape';
  const used = new Set<string>();
  const clips: Record<string, unknown>[] = [];
  for (const scene of scenesOf(ctx)) {
    const query = searchWords(scene.description || '');
    const seconds = Math.max(1, (num(scene.endSec) ?? 0) - (num(scene.startSec) ?? 0));
    const found = query ? await searchStockClips(query, { orientation, minSeconds: seconds }) : [];
    const clip = found.find((c) => !used.has(`${c.source}:${c.id}`));
    if (!clip) {
      clips.push({ sceneId: scene.id, path: null, query, reason: query ? 'No clip matched.' : 'The scene has no description to search for.' });
      continue;
    }
    used.add(`${clip.source}:${clip.id}`);
    const relPath = `${ctx.dir}/broll/v${ctx.version}-${scene.id}.mp4`;
    try {
      await invoke('content_download_media', { request: {
        workspaceRoot: ctx.root, url: clip.url, relPath,
        ...(clip.source === 'coverr' ? { coverrId: clip.id, apiKey: getConnectorCredential('coverr', 'COVERR_API_KEY') || undefined } : {}),
      } });
      clips.push({ sceneId: scene.id, path: relPath, query, source: clip.source, id: clip.id, author: clip.author, pageUrl: clip.pageUrl, license: clip.license });
    } catch (error) {
      clips.push({ sceneId: scene.id, path: null, query, reason: `The clip could not be downloaded: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const got = clips.filter((c) => c.path).length;
  return done(assignment, { clips }, `Stock clips for ${got} of ${clips.length} scenes.`);
}

function hex(colour: string): string {
  const c = colour.trim();
  return c.startsWith('#') ? c : `#${c}`;
}

async function runAssemble(assignment: MediaAssignment, ctx: Context): Promise<ContentStepResult> {
  const voice = part<VoiceOutput>(ctx.prior, 'voice', 'miya');
  if (!voice?.full || !Array.isArray(voice.lines)) return failed(assignment, NO_VOICE);
  const music = part<{ path?: string }>(ctx.prior, 'music', 'miya')?.path;
  const clips = part<{ clips?: { sceneId: string; path: string | null }[] }>(ctx.prior, 'broll', 'hector')?.clips || [];
  const scenesVersion = chosenVersionOf(ctx.project, 'scenes');
  const pictures = ((scenesVersion?.output as { pictures?: { sceneId: string; status: string; relativePath?: string }[] })?.pictures) || [];
  const palette = ctx.brand.palette || [];

  // Captions: the script's words, timed by Whisper when it is installed.
  const status = await invoke<{ whisper?: boolean }>('media_tools_status').catch(() => ({ whisper: false }));
  let captions: 'whisper' | 'lines' = 'lines';
  let words = captionsFromLines(voice.lines.map((l) => ({ text: l.text, start: l.startSec, end: l.endSec })));
  if (status?.whisper) {
    const heard = await invoke<{ ok?: boolean; words?: { word: string; start: number; end: number }[] }>('content_whisper_words', {
      request: { workspaceRoot: ctx.root, audioPath: voice.full },
    }).catch(() => null);
    if (heard?.ok && heard.words?.length) {
      words = alignCaptions(voice.lines.flatMap((l) => l.text.split(/\s+/).filter(Boolean)), heard.words);
      captions = 'whisper';
    }
  }
  const outDir = `${ctx.dir}/output`;
  const srt = `${outDir}/v${ctx.version}.srt`;
  await invoke('write_workspace_text_file', { workspaceRoot: ctx.root, relativePath: srt, content: toSrt(words, { maxWords: 6, maxSeconds: 2.5 }) });

  const scenes = voice.lines.map((line) => {
    const seconds = Math.max(0.5, line.endSec - line.startSec);
    const clip = clips.find((c) => c.sceneId === line.sceneId && c.path)?.path;
    if (clip) return { clip, seconds };
    const picture = pictures.find((p) => p.sceneId === line.sceneId && p.status === 'done' && p.relativePath)?.relativePath;
    if (picture) return { picture, seconds };
    return { cardColor: hex(darkestColour(palette)), seconds };
  });
  const result = await invoke<{ ok?: boolean; outputs?: { aspect: string; path: string; durationSec: number; frames: string[] }[] }>('content_assemble_video', { spec: {
    workspaceRoot: ctx.root, outDir, version: ctx.version, scenes,
    voice: voice.full, voiceSeconds: voice.durationSec,
    ...(music ? { music } : {}),
    srt, captionColor: hex(headlineColour(palette)), outlineColor: hex(darkestColour(palette)),
  } });
  const outputs = (result?.outputs || []).map((o) => ({
    aspect: o.aspect, durationSec: o.durationSec,
    path: `${outDir}/${o.path}`, frames: (o.frames || []).map((f) => `${outDir}/${f}`),
  }));
  return done(
    assignment,
    { outputs, srt, captions, ...(captions === 'lines' ? { note: NO_WHISPER_NOTE } : {}) },
    `Finished video: ${outputs.map((o) => o.aspect.replace('x', ':')).join(' and ') || 'none'}.`,
  );
}

export async function executeMediaStep(assignment: MediaAssignment): Promise<ContentStepResult> {
  try {
    const ctx = context(assignment);
    switch (assignment.actionType) {
      case 'creative_voice': return await runVoice(assignment, ctx);
      case 'creative_music': return await runMusic(assignment, ctx);
      case 'research_broll': return await runBroll(assignment, ctx);
      case 'runtime_assemble_video': return await runAssemble(assignment, ctx);
      default: return failed(assignment, `Unknown media step: ${assignment.actionType}`);
    }
  } catch (error) {
    return failed(assignment, error instanceof Error ? error.message : String(error));
  }
}
