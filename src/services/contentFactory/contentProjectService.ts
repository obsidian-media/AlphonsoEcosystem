// Content-factory projects: steps, versions, out-of-date marks.
// The full project is also written to its folder (contentProjectFiles.ts).
import { durableGet, durableSet } from '../../lib/durableStore.js';
import { slugForFolder } from './contentProjectFiles';
import { getBrand } from './contentBrandService';
import {
  STEP_ORDER,
  SIDE_STEPS,
  DEFAULT_SHORTS_SETTINGS,
  type PostPlatform,
  type ShortKind,
  type ShortsSettings,
  secureId,
  type BasedOn,
  type ContentBrief,
  type ContentProject,
  type ProjectPost,
  type StepId,
  type StepState,
  type StepVersion,
  type VideoSettings,
  DEFAULT_VIDEO_SETTINGS,
} from './contentTypes';

const PROJECTS_KEY = 'alphonso_content_projects_v1';
const MAX_VERSIONS = 20;
const MAX_PROGRESS = 200;
/** Steps that wait for the user's approval after they run. */
const APPROVAL_STEPS: StepId[] = ['review', 'quality'];

export function emptyBrief(): ContentBrief {
  return {
    idea: '',
    platforms: [],
    outputs: [],
    format: 'voiceover_broll',
    lengthSec: 60,
    notes: '',
    writeInMyVoice: false,
    showEverything: false,
  };
}

function emptyStep(): StepState {
  return { status: 'not_started', versions: [], chosenVersion: null, error: null, startedAtMs: null, progress: [], runBasedOn: null };
}

function readProjects(): ContentProject[] {
  try {
    const parsed = JSON.parse(durableGet(PROJECTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    // Projects made before a step existed (Voice, Music, B-roll, Assemble: phase 2a) gain it, not started.
    for (const project of parsed as ContentProject[]) {
      if (!project?.steps) continue;
      for (const step of STEP_ORDER) if (!project.steps[step]) project.steps[step] = emptyStep();
    }
    return parsed;
  } catch {
    return [];
  }
}

function writeProjects(projects: ContentProject[]): void {
  durableSet(PROJECTS_KEY, JSON.stringify(projects));
}

function update(id: string, change: (project: ContentProject) => void): ContentProject {
  const projects = readProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) throw new Error(`Content project not found: ${id}`);
  change(project);
  project.updatedAtMs = Date.now();
  writeProjects(projects);
  return project;
}

function earlierSteps(step: StepId): StepId[] {
  const earlier = STEP_ORDER.slice(0, STEP_ORDER.indexOf(step));
  // Side pieces don't feed each other (phase 3d): the carousel doesn't put Shorts out of date.
  return SIDE_STEPS.includes(step) ? earlier.filter((s) => !SIDE_STEPS.includes(s)) : earlier;
}

/** What `step` is based on right now: the brief's revision and each earlier step's chosen version. */
function currentBasedOn(project: ContentProject, step: StepId): BasedOn {
  const basedOn: BasedOn = {};
  for (const earlier of earlierSteps(step)) {
    if (earlier === 'brief') basedOn.brief = project.briefRevision;
    else if (project.steps[earlier].chosenVersion !== null) basedOn[earlier] = project.steps[earlier].chosenVersion as number;
  }
  return basedOn;
}

function sameBasedOn(a: BasedOn, b: BasedOn): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<StepId>;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export function createProject(brandId: string, name: string, brief: ContentBrief): ContentProject {
  const now = Date.now();
  const steps = Object.fromEntries(STEP_ORDER.map((step) => [step, emptyStep()])) as Record<StepId, StepState>;
  const project: ContentProject = {
    id: secureId('content'),
    brandId,
    name,
    folderName: slugForFolder(name),
    brief,
    briefRevision: 1,
    steps,
    createdAtMs: now,
    updatedAtMs: now,
  };
  writeProjects([...readProjects(), project]);
  return project;
}

export function listProjects(brandId?: string): ContentProject[] {
  return readProjects()
    .filter((p) => !brandId || p.brandId === brandId)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function getProject(id: string): ContentProject | null {
  return readProjects().find((p) => p.id === id) || null;
}

export function updateBrief(id: string, brief: ContentBrief): ContentProject {
  return update(id, (p) => {
    p.brief = brief;
    p.briefRevision += 1;
  });
}

export function startStep(id: string, step: StepId): ContentProject {
  return update(id, (p) => {
    const s = p.steps[step];
    s.status = 'running';
    s.startedAtMs = Date.now();
    s.error = null;
    s.progress = [];
    s.runBasedOn = currentBasedOn(p, step);
  });
}

export function addStepProgress(id: string, step: StepId, message: string): ContentProject {
  return update(id, (p) => {
    const s = p.steps[step];
    s.progress = [...s.progress, { message, atMs: Date.now() }].slice(-MAX_PROGRESS);
  });
}

export function saveStepVersion(
  id: string,
  step: StepId,
  result: { output: unknown; summary: string; joseCommandId: string | null },
): ContentProject {
  return update(id, (p) => {
    const s = p.steps[step];
    const now = currentBasedOn(p, step);
    const basedOn = s.runBasedOn || now;
    const last = s.versions[s.versions.length - 1];
    const version: StepVersion = {
      version: (last?.version || 0) + 1,
      createdAtMs: Date.now(),
      output: result.output,
      summary: result.summary,
      joseCommandId: result.joseCommandId,
      // An earlier step changed while this one ran: the result is already out of date.
      stale: !sameBasedOn(basedOn, now),
      basedOn,
    };
    s.versions = [...s.versions, version].slice(-MAX_VERSIONS);
    s.chosenVersion = version.version;
    s.status = APPROVAL_STEPS.includes(step) ? 'needs_approval' : 'done';
    s.error = null;
    s.runBasedOn = null;
    delete s.pendingAgents;
  });
}

/** Replaces the project's posts (phase 3a); `change` edits them in place. */
export function changeProjectPosts(id: string, change: (posts: ProjectPost[]) => ProjectPost[]): ContentProject {
  return update(id, (p) => {
    p.posts = change(p.posts ? p.posts.map((post) => ({ ...post })) : []);
  });
}

/** Remembers the project's latest Jose request (phase 6b). */
export function setProjectRequest(id: string, requestId: string): ContentProject {
  return update(id, (p) => {
    p.joseRequestId = requestId;
  });
}

/** Keeps the answers of a step's agents that have finished (phase 6b). */
export function setPendingAgents(id: string, step: StepId, pending: Record<string, unknown>): ContentProject {
  return update(id, (p) => {
    p.steps[step].pendingAgents = pending;
  });
}

export function failStep(id: string, step: StepId, error: string): ContentProject {
  return update(id, (p) => {
    p.steps[step].status = 'failed';
    p.steps[step].error = error;
    p.steps[step].runBasedOn = null;
    delete p.steps[step].pendingAgents;
  });
}

/** Sets a status with a message, e.g. waiting for approval. */
export function markStepStatus(id: string, step: StepId, status: StepState['status'], message: string | null): ContentProject {
  return update(id, (p) => {
    p.steps[step].status = status;
    p.steps[step].error = message;
    p.steps[step].runBasedOn = null;
  });
}

/** Adds or replaces fields on a version's output (e.g. the pictures made for it). */
/** The project's AI clip settings, with the defaults filled in. */
export function getVideoSettings(project: ContentProject): VideoSettings {
  const saved = project.videoSettings || {};
  const aiClips = saved.aiClips === 'every' || saved.aiClips === 'none' ? saved.aiClips : 'main';
  const clipEngine = saved.clipEngine === 'local' || saved.clipEngine === 'runway' || saved.clipEngine === 'higgsfield' ? saved.clipEngine : null;
  const runwayModel = typeof saved.runwayModel === 'string' && saved.runwayModel.trim() ? saved.runwayModel.trim() : DEFAULT_VIDEO_SETTINGS.runwayModel;
  const voiceEngine = saved.voiceEngine === 'kokoro' || saved.voiceEngine === 'elevenlabs' ? saved.voiceEngine : undefined;
  const pictures = saved.pictures === 'comfyui' || saved.pictures === 'higgsfield' ? saved.pictures : undefined;
  const characterId = typeof saved.characterId === 'string' && saved.characterId.trim() ? saved.characterId.trim() : undefined;
  return { aiClips, clipEngine, runwayModel, ...(voiceEngine ? { voiceEngine } : {}), ...(pictures ? { pictures } : {}), ...(characterId ? { characterId } : {}) };
}

export function setVideoSettings(id: string, patch: Partial<VideoSettings>): ContentProject {
  return update(id, (p) => {
    p.videoSettings = { ...getVideoSettings(p), ...patch };
  });
}

/** Marks a scene of the chosen scene plan as a main moment, or not; changes no version's date. */
export function setMainMoment(id: string, sceneId: string, on: boolean): ContentProject {
  return update(id, (p) => {
    const chosen = p.steps.scenes.versions.find((v) => v.version === p.steps.scenes.chosenVersion);
    const scenes = (chosen?.output as { miya?: { scenes?: { id: string; mainMoment?: boolean }[] } } | undefined)?.miya?.scenes;
    const scene = scenes?.find((s) => s.id === sceneId);
    if (!scene) throw new Error(`No scene ${sceneId} in the chosen scene plan.`);
    scene.mainMoment = on;
  });
}

/** A scene's character (phase 4c): a brand character's id, 'none', or null for the project's. */
export function setSceneCharacter(id: string, sceneId: string, characterId: string | null): ContentProject {
  return update(id, (p) => {
    const chosen = p.steps.scenes.versions.find((v) => v.version === p.steps.scenes.chosenVersion);
    const scenes = (chosen?.output as { miya?: { scenes?: { id: string; characterId?: string }[] } } | undefined)?.miya?.scenes;
    const scene = scenes?.find((s) => s.id === sceneId);
    if (!scene) throw new Error(`No scene ${sceneId} in the chosen scene plan.`);
    if (characterId) scene.characterId = characterId;
    else delete scene.characterId;
  });
}

/**
 * Moves a carousel slide (and its picture) in the chosen version (phase 3c). Nothing goes
 * out of date and no new version is made; the first slide is always the cover.
 */
export function reorderSlides(id: string, from: number, to: number): ContentProject {
  return update(id, (p) => {
    const chosen = p.steps.carousel.versions.find((v) => v.version === p.steps.carousel.chosenVersion);
    const output = chosen?.output as { miya?: { slides?: { id: string; cover?: boolean }[] }; pictures?: { sceneId: string }[] } | undefined;
    const slides = output?.miya?.slides;
    if (!slides || from < 0 || to < 0 || from >= slides.length || to >= slides.length) throw new Error('That slide is not in the chosen carousel.');
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    slides.forEach((s, i) => { s.cover = i === 0; });
    if (output.pictures) {
      const order = slides.map((s) => s.id);
      output.pictures.sort((a, b) => order.indexOf(a.sceneId) - order.indexOf(b.sceneId));
    }
  });
}

/** The Shorts' own AI clip setting (phase 3d); off until chosen. */
export function getShortsSettings(project: ContentProject): ShortsSettings {
  return { ...DEFAULT_SHORTS_SETTINGS, ...(project.shortsSettings || {}) };
}

export function setShortsSettings(id: string, settings: Partial<ShortsSettings>): ContentProject {
  return update(id, (p) => { p.shortsSettings = { ...getShortsSettings(p), ...settings }; });
}

function editShort(id: string, shortId: string, change: (short: { kind?: ShortKind; platforms?: PostPlatform[] }) => void): ContentProject {
  return update(id, (p) => {
    const chosen = p.steps.shorts.versions.find((v) => v.version === p.steps.shorts.chosenVersion);
    const shorts = (chosen?.output as { miya?: { shorts?: { id: string; kind?: ShortKind; platforms?: PostPlatform[] }[] } } | undefined)?.miya?.shorts;
    const short = shorts?.find((s) => s.id === shortId);
    if (!short) throw new Error(`No Short ${shortId} in the chosen Shorts.`);
    change(short);
  });
}

/** Which platforms a Short goes to (Shorts Studio); nothing goes out of date. */
export function setShortPlatforms(id: string, shortId: string, platforms: PostPlatform[]): ContentProject {
  return editShort(id, shortId, (s) => { s.platforms = [...new Set(platforms)]; });
}

/** A Short's kind (Shorts Studio); it is made again with Redo. */
export function setShortKind(id: string, shortId: string, kind: ShortKind): ContentProject {
  return editShort(id, shortId, (s) => { s.kind = kind; });
}

/**
 * Shorts Studio's "Add a Short" (phase 3d): a plain 45 s cut from the middle of the
 * finished video (no model needed), on the project's platforms; its kind and part can
 * then be changed and it is made with Redo.
 */
export function addShortPlan(id: string, kind: 'cut' | 'highlight' = 'cut'): ContentProject {
  return update(id, (p) => {
    const chosen = p.steps.shorts.versions.find((v) => v.version === p.steps.shorts.chosenVersion);
    if (!chosen) throw new Error('Run the Shorts step first.');
    const output = (chosen.output as { miya?: { shorts?: { id: string }[] } }) || {};
    const shorts = output.miya?.shorts || [];
    const outputs = (p.steps.assemble.versions.find((v) => v.version === p.steps.assemble.chosenVersion)?.output as { miya?: { outputs?: { aspect: string; durationSec?: number }[] } } | undefined)?.miya?.outputs || [];
    const length = outputs.find((o) => o.aspect === '9x16')?.durationSec ?? 45;
    const start = Math.max(0, (length - 45) / 2);
    const n = shorts.length + 1;
    const wanted = p.brief.platforms.length ? p.brief.platforms : getBrand(p.brandId)?.platforms || [];
    const known = ['youtube', 'instagram', 'facebook'];
    const platforms = wanted.map((x) => String(x).trim().toLowerCase()).filter((x) => known.includes(x));
    const next = { id: `sh${n}`, kind, title: `Short ${n}`, hook: '', seconds: 45, platforms, copy: [], moment: { startSec: start, endSec: Math.min(length, start + 45) } };
    chosen.output = { ...output, miya: { ...(output.miya || {}), shorts: [...shorts, next] } };
  });
}

/** Adds a Short Miya wrote on its own (phase 4a: Add a Short as a mini-script); returns its id. */
export function appendShortPlan(id: string, plan: Record<string, unknown>): string {
  let added = '';
  update(id, (p) => {
    const chosen = p.steps.shorts.versions.find((v) => v.version === p.steps.shorts.chosenVersion);
    if (!chosen) throw new Error('Run the Shorts step first.');
    const output = (chosen.output as { miya?: { shorts?: { id: string }[] } }) || {};
    const shorts = output.miya?.shorts || [];
    added = `sh${shorts.length + 1}`;
    chosen.output = { ...output, miya: { ...(output.miya || {}), shorts: [...shorts, { ...plan, id: added }] } };
  });
  return added;
}

/** A made Short's file and state, kept in the chosen Shorts version (phase 3d). */
export function setShortOutput(id: string, shortId: string, output: unknown): ContentProject {
  return update(id, (p) => {
    const chosen = p.steps.shorts.versions.find((v) => v.version === p.steps.shorts.chosenVersion);
    if (!chosen) throw new Error('Run the Shorts step first.');
    const current = (chosen.output as Record<string, unknown>) || {};
    const made = { ...((current.made as Record<string, unknown>) || {}), [shortId]: output };
    chosen.output = { ...current, made };
  });
}

export function setVersionOutputField(id: string, step: StepId, version: number, field: string, value: unknown): ContentProject {
  return update(id, (p) => {
    const v = p.steps[step].versions.find((item) => item.version === version);
    if (!v) throw new Error(`No version ${version} of ${step}`);
    v.output = { ...((v.output as Record<string, unknown>) || {}), [field]: value };
  });
}

export function chooseVersion(id: string, step: StepId, version: number): ContentProject {
  return update(id, (p) => {
    if (!p.steps[step].versions.some((v) => v.version === version)) throw new Error(`No version ${version} of ${step}`);
    p.steps[step].chosenVersion = version;
  });
}

export function approveStep(id: string, step: StepId): ContentProject {
  return update(id, (p) => {
    p.steps[step].status = 'approved';
    p.steps[step].error = null;
  });
}

export function sendBackStep(id: string, step: StepId, reason: string): ContentProject {
  return update(id, (p) => {
    p.steps[step].status = 'sent_back';
    p.steps[step].error = reason;
  });
}

export function chosenVersionOf(project: ContentProject, step: StepId): StepVersion | null {
  const s = project.steps[step];
  return s.versions.find((v) => v.version === s.chosenVersion) || null;
}

/** True when the chosen version was made from an older brief or older earlier steps. */
export function isStepStale(project: ContentProject, step: StepId): boolean {
  const chosen = chosenVersionOf(project, step);
  if (!chosen) return false;
  return chosen.stale || !sameBasedOn(chosen.basedOn, currentBasedOn(project, step));
}

/** A step still "running" after a restart was cut off when the app closed. */
export function recoverInterruptedSteps(): number {
  const projects = readProjects();
  let count = 0;
  for (const p of projects) {
    for (const step of STEP_ORDER) {
      if (p.steps[step]?.status === 'running') {
        p.steps[step].status = 'interrupted';
        p.steps[step].runBasedOn = null;
        count += 1;
      }
    }
  }
  if (count > 0) writeProjects(projects);
  return count;
}
