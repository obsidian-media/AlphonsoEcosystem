// Pictures for the Scene Builder (one per scene, one shared look) and the
// Thumbnail Studio (3 finished thumbnails with the headline drawn on).
// One picture at a time: Ollama and ComfyUI share the GPU.
import { invoke } from '@tauri-apps/api/core';
import { generateComfyUiImage, checkComfyUiImage, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { higgsfieldKeys, higgsfieldModels } from '../connectors/higgsfieldConnector';
import { canSpend, recordSpendUsd } from '../jose/joseSpend';
import { higgsfieldPictureLimit, resolvePictures } from './engineChoice';
import { getBrand } from './contentBrandService';
import { addStepProgress, chosenVersionOf, getProject, setVersionOutputField } from './contentProjectService';
import { loadProjectImage, outputPath, projectRelativeDir, requireOutputRoot, saveProjectImage, writeProjectFile } from './contentProjectFiles';
import { drawHeadline, drawSlide, slideSize, type HeadlineSide } from './thumbnailRenderer';
import type { CarouselSlide, ContentBrand, ContentBrief, ContentProject, StepId } from './contentTypes';

export interface PictureResult {
  sceneId: string;
  status: 'done' | 'pending' | 'failed';
  path?: string;
  /** Relative to the output folder, for showing it (read_workspace_image). */
  relativePath?: string;
  jobId?: string;
  error?: string;
  /** Thumbnails: the headline drawn on, and its side. */
  headline?: string;
  layout?: HeadlineSide;
  /** Higgsfield (phase 4b): a picture still being made there, fetched by Check again; its estimate. */
  requestId?: string;
  usd?: number;
}

/** Phase 4b: Higgsfield is used only when this run's spending was approved. */
export interface PictureOptions { paidApproved?: boolean }

type Settings = { outputFolder?: string | null };
type ImageResult = { ok?: boolean; pending?: boolean; jobId?: string; requestId?: string; usd?: number; previewBase64?: string; savedPath?: string; error?: string };

const VERTICAL = /short|reel|tiktok|story|vertical/i;

/** Every requested output is vertical (Shorts, Reels, TikTok, Stories). */
export function isVerticalOnly(brief: ContentBrief): boolean {
  return brief.outputs.length > 0 && brief.outputs.every((o) => VERTICAL.test(o));
}

function context(projectId: string, step: StepId, settings: Settings) {
  const project = getProject(projectId);
  if (!project) throw new Error(`Content project not found: ${projectId}`);
  const brand = getBrand(project.brandId);
  if (!brand) throw new Error('This project\'s brand no longer exists.');
  const version = chosenVersionOf(project, step);
  if (!version) throw new Error(`Run the ${step} step first.`);
  return { project, brand, version, root: requireOutputRoot(settings) };
}

type Choice = { engine: 'comfyui' | 'higgsfield'; note?: string; usd?: number; limit: number; notes: string[] };

/** Which engine this run's pictures use: Higgsfield only with the run's approval. */
function choosePictures(project: ContentProject, brand: ContentBrand, step: 'scenes' | 'thumbnail' | 'carousel', options?: PictureOptions): Choice {
  const picked = resolvePictures(project, brand);
  const limit = higgsfieldPictureLimit(project, step);
  if (picked.engine === 'higgsfield' && !options?.paidApproved) return { engine: 'comfyui', note: "Higgsfield wasn't approved for this run; made with ComfyUI.", limit, notes: [] };
  return { ...picked, limit, notes: [] };
}

function stripDataUrl(value: string | null): string {
  return String(value || '').replace(/^data:[^;]+;base64,/, '');
}

/**
 * One picture: from Higgsfield (within the approval and the monthly cap; saved at `higgsfieldRel`,
 * read back when text is drawn on it) or ComfyUI.
 */
async function makePicture(
  rootDir: string, choice: Choice, index: number, comfy: Parameters<typeof generateComfyUiImage>[0], aspect: string, higgsfieldRel: string, readBack: boolean,
): Promise<ImageResult> {
  if (choice.engine === 'higgsfield' && choice.usd !== undefined) {
    const cap = canSpend(choice.usd);
    if (index >= choice.limit) {
      if (!choice.notes.includes(MORE_THAN_APPROVED)) choice.notes.push(MORE_THAN_APPROVED);
    } else if (!cap.ok) {
      const capNote = `${cap.reason}; the rest were made with ComfyUI.`;
      if (!choice.notes.includes(capNote)) choice.notes.push(capNote);
    } else {
      const models = higgsfieldModels();
      const answer = await invoke<{ ok?: boolean; status?: string; requestId?: string; reason?: string }>('higgsfield_run', {
        job: { model: models.picture, prompt: comfy.prompt, aspect, extra: models.pictureExtra ?? null },
        workspaceRoot: rootDir, outPath: higgsfieldRel, keys: higgsfieldKeys(),
      }).catch(() => ({ ok: false, reason: 'Higgsfield could not be reached.' }));
      return higgsfieldResult(rootDir, answer, choice.usd, higgsfieldRel, readBack);
    }
  }
  try {
    return await generateComfyUiImage(comfy, { endpoint: getComfyUiEndpoint() }) as ImageResult;
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

const MORE_THAN_APPROVED = 'More pictures than this run approved; the rest were made with ComfyUI.';

async function higgsfieldResult(
  rootDir: string, answer: { ok?: boolean; status?: string; requestId?: string; reason?: string }, usd: number | undefined, rel: string, readBack: boolean,
): Promise<ImageResult> {
  if (answer?.status === 'pending' && answer.requestId) return { pending: true, requestId: answer.requestId, usd };
  if (!answer?.ok || answer.status !== 'done') return { ok: false, error: answer?.reason || 'Higgsfield made no picture.' };
  if (usd !== undefined) recordSpendUsd(usd);
  if (!readBack) return { ok: true, savedPath: outputPath(rootDir, rel) };
  const base64 = stripDataUrl(await loadProjectImage(rootDir, rel));
  return base64 ? { ok: true, previewBase64: base64 } : { ok: false, error: 'The Higgsfield picture could not be read.' };
}

/** Saves which engine made a version's pictures, and why not Higgsfield when it was chosen. */
function pictureNote(choice: Choice): string | undefined {
  const notes = [choice.note, ...choice.notes].filter(Boolean);
  return notes.length ? notes.join(' ') : undefined;
}

function aspectOf(width: number, height: number): string {
  if (width === height) return '1:1';
  if (width > height) return '16:9';
  return Math.abs(width / height - 0.8) < 0.05 ? '4:5' : '9:16';
}

async function toPicture(
  result: ImageResult, save: (base64: string) => Promise<string>, base: Omit<PictureResult, 'status'>, relativePath: string,
): Promise<PictureResult> {
  if (result?.pending && result.requestId) return { ...base, status: 'pending', requestId: result.requestId, ...(result.usd !== undefined ? { usd: result.usd } : {}) };
  if (result?.pending && result.jobId) return { ...base, status: 'pending', jobId: result.jobId };
  // A Higgsfield scene picture is already saved where it belongs.
  if (result?.ok && result.savedPath) return { ...base, status: 'done', path: result.savedPath, relativePath };
  if (!result?.ok || !result.previewBase64) {
    return { ...base, status: 'failed', error: result?.error || 'ComfyUI returned no picture.' };
  }
  try {
    return { ...base, status: 'done', path: await save(result.previewBase64), relativePath };
  } catch (error) {
    return { ...base, status: 'failed', error: `The picture could not be saved: ${(error as Error).message}` };
  }
}

export async function renderScenePictures(projectId: string, settings: Settings, onProgress?: (m: string) => void, options?: PictureOptions): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, 'scenes', settings);
  const choice = choosePictures(project, brand, 'scenes', options);
  const plan = (version.output as { miya?: { style?: string; scenes?: { id: string; imagePrompt: string; negativePrompt?: string }[] } })?.miya;
  const scenes = plan?.scenes || [];
  const vertical = isVerticalOnly(project.brief);
  const look = [plan?.style, brand.visualStyle, brand.characterRefs].filter(Boolean).join(', ');
  const results: PictureResult[] = [];
  for (const [index, scene] of scenes.entries()) {
    const message = `Making scene picture ${index + 1} of ${scenes.length}…`;
    addStepProgress(projectId, 'scenes', message);
    onProgress?.(message);
    const file = `v${version.version}-${scene.id}.png`;
    const result = await makePicture(
      root, choice, index,
      { prompt: [scene.imagePrompt, look].filter(Boolean).join('. '), negativePrompt: scene.negativePrompt || '', width: vertical ? 480 : 832, height: vertical ? 832 : 480 },
      vertical ? '9:16' : '16:9', `${projectRelativeDir(brand, project)}/scenes/${file}`, false,
    );
    results.push(await toPicture(result, (b64) => saveProjectImage(root, brand, project, 'scenes', file, b64), { sceneId: scene.id }, `${projectRelativeDir(brand, project)}/scenes/${file}`));
  }
  setVersionOutputField(projectId, 'scenes', version.version, 'pictureNote', pictureNote(choice));
  const saved = setVersionOutputField(projectId, 'scenes', version.version, 'pictures', results);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return results;
}

export async function renderThumbnails(projectId: string, settings: Settings, onProgress?: (m: string) => void, options?: PictureOptions): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, 'thumbnail', settings);
  const choice = choosePictures(project, brand, 'thumbnail', options);
  const concepts = (version.output as { miya?: { concepts?: { id: string; headline: string; imagePrompt: string; layout: HeadlineSide }[] } })?.miya?.concepts || [];
  const look = [brand.visualStyle, brand.characterRefs].filter(Boolean).join(', ');
  const results: PictureResult[] = [];
  for (const [index, concept] of concepts.slice(0, 3).entries()) {
    const message = `Making thumbnail ${index + 1} of 3…`;
    addStepProgress(projectId, 'thumbnail', message);
    onProgress?.(message);
    const file = `v${version.version}-${concept.id}.png`;
    const result = await makePicture(
      // The headline is drawn by Alphonso afterwards: models misspell text.
      root, choice, index, { prompt: [concept.imagePrompt, look, 'no text, no letters, no words'].filter(Boolean).join('. '), width: 1280, height: 720 },
      '16:9', `${projectRelativeDir(brand, project)}/thumbnail/v${version.version}-${concept.id}-hf.png`, true,
    );
    const save = async (b64: string) => saveProjectImage(
      root, brand, project, 'thumbnail', file, await drawHeadline(b64, concept.headline, brand, concept.layout),
    );
    results.push(await toPicture(result, save, { sceneId: concept.id, headline: concept.headline, layout: concept.layout }, `${projectRelativeDir(brand, project)}/thumbnail/${file}`));
  }
  setVersionOutputField(projectId, 'thumbnail', version.version, 'pictureNote', pictureNote(choice));
  const saved = setVersionOutputField(projectId, 'thumbnail', version.version, 'pictures', results);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return results;
}

function slidesOf(output: unknown): CarouselSlide[] {
  return (output as { miya?: { slides?: CarouselSlide[] } })?.miya?.slides || [];
}

/** A slide's picture with its text drawn on, at the brand's shape. */
function drawnSlide(b64: string, slide: CarouselSlide | undefined, brand: ContentBrand): Promise<string> {
  return slide ? drawSlide(b64, slide, brand, slideSize(brand.carouselShape)) : Promise.resolve(b64);
}

/**
 * Carousel slides (phase 3c): one picture per slide at the brand's shape, one at a time,
 * with the headline and body drawn on. With `only` (a slide's position) just that slide
 * is made again and the others are kept.
 */
export async function renderCarouselSlides(projectId: string, settings: Settings, onProgress?: (m: string) => void, only?: number, options?: PictureOptions): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, 'carousel', settings);
  const choice = choosePictures(project, brand, 'carousel', options);
  const slides = slidesOf(version.output);
  const kept = (version.output as { pictures?: PictureResult[] })?.pictures || [];
  const size = slideSize(brand.carouselShape);
  const look = [brand.visualStyle, brand.characterRefs].filter(Boolean).join(', ');
  const results: PictureResult[] = [];
  for (const [index, slide] of slides.entries()) {
    if (only !== undefined && index !== only) {
      results.push(kept.find((k) => k.sceneId === slide.id) || { sceneId: slide.id, status: 'failed', error: 'Not made yet.' });
      continue;
    }
    const message = `Making carousel slide ${index + 1} of ${slides.length}…`;
    addStepProgress(projectId, 'carousel', message);
    onProgress?.(message);
    const file = `v${version.version}-${slide.id}.png`;
    const result = await makePicture(
      // The text is drawn by Alphonso afterwards: models misspell text.
      root, choice, index, { prompt: [slide.imagePrompt, look, 'no text, no letters, no words'].filter(Boolean).join('. '), width: size.width, height: size.height },
      aspectOf(size.width, size.height), `${projectRelativeDir(brand, project)}/carousel/v${version.version}-${slide.id}-hf.png`, true,
    );
    const save = async (b64: string) => saveProjectImage(root, brand, project, 'carousel', file, await drawnSlide(b64, slide, brand));
    results.push(await toPicture(result, save, { sceneId: slide.id, headline: slide.headline }, `${projectRelativeDir(brand, project)}/carousel/${file}`));
  }
  if (only === undefined) setVersionOutputField(projectId, 'carousel', version.version, 'pictureNote', pictureNote(choice));
  const saved = setVersionOutputField(projectId, 'carousel', version.version, 'pictures', results);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return results;
}

/** Looks again for pictures ComfyUI had not finished. */
export async function checkPendingPictures(projectId: string, step: 'scenes' | 'thumbnail' | 'carousel', settings: Settings): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, step, settings);
  const pictures = ((version.output as { pictures?: PictureResult[] })?.pictures || []).slice();
  const slides = slidesOf(version.output);
  for (const [i, picture] of pictures.entries()) {
    if (picture.status !== 'pending' || (!picture.jobId && !picture.requestId)) continue;
    const file = `v${version.version}-${picture.sceneId}.png`;
    // Higgsfield (phase 4b): one look at the request it is still making; never a new run.
    const higgsfieldRel = `${projectRelativeDir(brand, project)}/${step}/${step === 'scenes' ? file : `v${version.version}-${picture.sceneId}-hf.png`}`;
    const result = picture.requestId
      ? await higgsfieldResult(
        root, await invoke<{ ok?: boolean; status?: string; requestId?: string; reason?: string }>('higgsfield_check', {
          requestId: picture.requestId, workspaceRoot: root, outPath: higgsfieldRel, keys: higgsfieldKeys(),
        }).catch(() => ({ ok: true, status: 'pending', requestId: picture.requestId })),
        picture.usd, higgsfieldRel, step !== 'scenes',
      )
      : await checkComfyUiImage(picture.jobId as string) as ImageResult;
    const save = async (b64: string) => saveProjectImage(
      root, brand, project, step, file,
      step === 'carousel'
        ? await drawnSlide(b64, slides.find((sl) => sl.id === picture.sceneId), brand)
        : step === 'thumbnail' && picture.headline ? await drawHeadline(b64, picture.headline, brand, picture.layout || 'left') : b64,
    );
    pictures[i] = await toPicture(result, save, { sceneId: picture.sceneId, headline: picture.headline, layout: picture.layout }, `${projectRelativeDir(brand, project)}/${step}/${file}`);
    if (result.pending && picture.usd !== undefined && pictures[i].requestId) pictures[i].usd = picture.usd;
  }
  const saved = setVersionOutputField(projectId, step, version.version, 'pictures', pictures);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return pictures;
}
