// Pictures for the Scene Builder (one per scene, one shared look) and the
// Thumbnail Studio (3 finished thumbnails with the headline drawn on).
// One picture at a time: Ollama and ComfyUI share the GPU.
import { generateComfyUiImage, checkComfyUiImage, getComfyUiEndpoint } from '../connectors/connectorImageGenerators';
import { getBrand } from './contentBrandService';
import { addStepProgress, chosenVersionOf, getProject, setVersionOutputField } from './contentProjectService';
import { requireOutputRoot, saveProjectImage, writeProjectFile } from './contentProjectFiles';
import { drawHeadline, type HeadlineSide } from './thumbnailRenderer';
import type { ContentBrief, StepId } from './contentTypes';

export interface PictureResult {
  sceneId: string;
  status: 'done' | 'pending' | 'failed';
  path?: string;
  jobId?: string;
  error?: string;
  /** Thumbnails: the headline drawn on, and its side. */
  headline?: string;
  layout?: HeadlineSide;
}

type Settings = { outputFolder?: string | null };
type ImageResult = { ok?: boolean; pending?: boolean; jobId?: string; previewBase64?: string; error?: string };

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

async function toPicture(
  result: ImageResult, save: (base64: string) => Promise<string>, base: Omit<PictureResult, 'status'>,
): Promise<PictureResult> {
  if (result?.pending && result.jobId) return { ...base, status: 'pending', jobId: result.jobId };
  if (!result?.ok || !result.previewBase64) {
    return { ...base, status: 'failed', error: result?.error || 'ComfyUI returned no picture.' };
  }
  return { ...base, status: 'done', path: await save(result.previewBase64) };
}

export async function renderScenePictures(projectId: string, settings: Settings, onProgress?: (m: string) => void): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, 'scenes', settings);
  const plan = (version.output as { miya?: { style?: string; scenes?: { id: string; imagePrompt: string; negativePrompt?: string }[] } })?.miya;
  const scenes = plan?.scenes || [];
  const vertical = isVerticalOnly(project.brief);
  const look = [plan?.style, brand.visualStyle, brand.characterRefs].filter(Boolean).join(', ');
  const results: PictureResult[] = [];
  for (const [index, scene] of scenes.entries()) {
    const message = `Making scene picture ${index + 1} of ${scenes.length}…`;
    addStepProgress(projectId, 'scenes', message);
    onProgress?.(message);
    let result: ImageResult;
    try {
      result = await generateComfyUiImage(
        { prompt: [scene.imagePrompt, look].filter(Boolean).join('. '), negativePrompt: scene.negativePrompt || '', width: vertical ? 480 : 832, height: vertical ? 832 : 480 },
        { endpoint: getComfyUiEndpoint() },
      ) as ImageResult;
    } catch (error) {
      result = { ok: false, error: (error as Error).message };
    }
    results.push(await toPicture(result, (b64) => saveProjectImage(root, brand, project, 'scenes', `v${version.version}-${scene.id}.png`, b64), { sceneId: scene.id }));
  }
  const saved = setVersionOutputField(projectId, 'scenes', version.version, 'pictures', results);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return results;
}

export async function renderThumbnails(projectId: string, settings: Settings, onProgress?: (m: string) => void): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, 'thumbnail', settings);
  const concepts = (version.output as { miya?: { concepts?: { id: string; headline: string; imagePrompt: string; layout: HeadlineSide }[] } })?.miya?.concepts || [];
  const look = [brand.visualStyle, brand.characterRefs].filter(Boolean).join(', ');
  const results: PictureResult[] = [];
  for (const [index, concept] of concepts.slice(0, 3).entries()) {
    const message = `Making thumbnail ${index + 1} of 3…`;
    addStepProgress(projectId, 'thumbnail', message);
    onProgress?.(message);
    let result: ImageResult;
    try {
      result = await generateComfyUiImage(
        // The headline is drawn by Alphonso afterwards: models misspell text.
        { prompt: [concept.imagePrompt, look, 'no text, no letters, no words'].filter(Boolean).join('. '), width: 1280, height: 720 },
        { endpoint: getComfyUiEndpoint() },
      ) as ImageResult;
    } catch (error) {
      result = { ok: false, error: (error as Error).message };
    }
    const save = async (b64: string) => saveProjectImage(
      root, brand, project, 'thumbnail', `v${version.version}-${concept.id}.png`, await drawHeadline(b64, concept.headline, brand, concept.layout),
    );
    results.push(await toPicture(result, save, { sceneId: concept.id, headline: concept.headline, layout: concept.layout }));
  }
  const saved = setVersionOutputField(projectId, 'thumbnail', version.version, 'pictures', results);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return results;
}

/** Looks again for pictures ComfyUI had not finished. */
export async function checkPendingPictures(projectId: string, step: 'scenes' | 'thumbnail', settings: Settings): Promise<PictureResult[]> {
  const { project, brand, version, root } = context(projectId, step, settings);
  const pictures = ((version.output as { pictures?: PictureResult[] })?.pictures || []).slice();
  for (const [i, picture] of pictures.entries()) {
    if (picture.status !== 'pending' || !picture.jobId) continue;
    const result = await checkComfyUiImage(picture.jobId) as ImageResult;
    const save = async (b64: string) => saveProjectImage(
      root, brand, project, step, `v${version.version}-${picture.sceneId}.png`,
      step === 'thumbnail' && picture.headline ? await drawHeadline(b64, picture.headline, brand, picture.layout || 'left') : b64,
    );
    pictures[i] = await toPicture(result, save, { sceneId: picture.sceneId, headline: picture.headline, layout: picture.layout });
  }
  const saved = setVersionOutputField(projectId, step, version.version, 'pictures', pictures);
  await writeProjectFile(root, brand, saved).catch(() => undefined);
  return pictures;
}
