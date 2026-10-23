// Types for Miya's content factory.
// Design: docs/superpowers/specs/2026-10-22-miya-content-factory-design.md

export interface ContentBrand {
  id: string;
  name: string;
  folderName: string;
  palette: string[];
  fonts: string;
  logo: string;
  tone: string;
  audience: string;
  visualStyle: string;
  characterRefs: string;
  voice: { engine: 'kokoro'; voiceId: string };
  platforms: string[];
  schedule: string;
  honestyRules: string;
  references: { url: string; note: string }[];
  lessons: { atMs: number; text: string; source: 'rejection' | 'user' }[];
  pastScripts: string;
  qualityThreshold: number;
  createdAtMs: number;
  updatedAtMs: number;
}

/** An id from secure random bytes (crypto.getRandomValues works in every
 *  supported web view, including macOS 10.15's; randomUUID does not). */
export function secureId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Own keys only, without Object.hasOwn (not in older Safari). */
export function hasOwnKey(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export type StepId =
  | 'brief' | 'research' | 'script' | 'review' | 'scenes' | 'thumbnail'
  | 'voice' | 'music' | 'broll' | 'clips' | 'assemble' | 'campaign' | 'quality';

/** Voice, Music, B-roll and Assemble make the finished video file (phase 2a). */
export const STEP_ORDER: StepId[] = [
  'brief', 'research', 'script', 'review', 'scenes', 'thumbnail', 'voice', 'music', 'broll', 'clips', 'assemble', 'campaign', 'quality',
];

export type StepStatus = 'not_started' | 'running' | 'done' | 'failed' | 'interrupted' | 'needs_approval' | 'approved' | 'sent_back';

/** What each earlier step's chosen version was when a version was made. `brief` is the brief's revision. */
export type BasedOn = Partial<Record<StepId, number>>;

export interface StepVersion {
  version: number;
  createdAtMs: number;
  output: unknown;
  summary: string;
  joseCommandId: string | null;
  stale: boolean;
  basedOn: BasedOn;
}

export interface StepState {
  status: StepStatus;
  versions: StepVersion[];
  chosenVersion: number | null;
  error: string | null;
  startedAtMs: number | null;
  progress: { message: string; atMs: number }[];
  /** Snapshot taken when the step started, so a run is judged against what it was given. */
  runBasedOn?: BasedOn | null;
  /** Answers from a step's agents that have finished, while the others still work (phase 6b). */
  pendingAgents?: Record<string, unknown>;
}

export type ContentFormat =
  | 'talking_head' | 'voiceover_broll' | 'tutorial' | 'story' | 'ad' | 'listicle'
  | 'podcast_solo' | 'podcast_two_hosts' | 'carousel' | 'image_post';

export const CONTENT_FORMATS: { id: ContentFormat; label: string }[] = [
  { id: 'talking_head', label: 'Talking head' },
  { id: 'voiceover_broll', label: 'Voice-over with B-roll' },
  { id: 'tutorial', label: 'Tutorial' },
  { id: 'story', label: 'Story' },
  { id: 'ad', label: 'Ad' },
  { id: 'listicle', label: 'List video' },
  { id: 'podcast_solo', label: 'Podcast (one host)' },
  { id: 'podcast_two_hosts', label: 'Podcast (two hosts)' },
  { id: 'carousel', label: 'Carousel' },
  { id: 'image_post', label: 'Image post' },
];

export interface ContentBrief {
  idea: string;
  platforms: string[];
  outputs: string[];
  format: ContentFormat;
  lengthSec: number;
  notes: string;
  writeInMyVoice: boolean;
  showEverything: boolean;
}

/** AI clips for the finished video (phase 2b). */
export interface VideoSettings {
  /** Main moments (Miya marks them, you change them), every scene, or none. */
  aiClips: 'main' | 'every' | 'none';
  /** null = automatic: a local video model if installed, else Runway, else none. */
  clipEngine: 'local' | 'runway' | null;
  runwayModel: string;
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = { aiClips: 'main', clipEngine: null, runwayModel: 'gen4_turbo' };

export interface ContentProject {
  id: string;
  brandId: string;
  name: string;
  folderName: string;
  brief: ContentBrief;
  briefRevision: number;
  steps: Record<StepId, StepState>;
  /** The latest Jose request for this project (phase 6b). */
  joseRequestId?: string | null;
  /** AI clips (phase 2b): kept beside the brief, so changing them puts nothing out of date. */
  videoSettings?: Partial<VideoSettings>;
  createdAtMs: number;
  updatedAtMs: number;
}

/** What a content-factory step sends to an agent through Jose. */
export interface ContentStepPayload {
  projectId: string;
  step: StepId;
  brief: ContentBrief;
  brand: ContentBrand;
  /** The chosen output of each earlier step. */
  prior: Partial<Record<StepId, unknown>>;
  /** The step's instruction, plus any reason the user sent it back with. */
  task: string;
  /** Real web results Hector found (research steps): the only sources allowed. */
  sources?: { url: string; title: string; snippet: string }[];
}
