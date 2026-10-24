// Types for Miya's content factory.
// Design: docs/superpowers/specs/2026-10-22-miya-content-factory-design.md

/** A brand lesson; one proposed from real numbers (phase 4a) reaches prompts only once kept. */
export interface BrandLesson {
  id?: string;
  atMs: number;
  text: string;
  source: 'rejection' | 'user' | 'performance';
  /** No status = kept (lessons from before phase 4a). */
  status?: 'proposed' | 'kept';
  kind?: 'worked' | 'didnt';
  postRef?: { projectId: string; postId: string };
}

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
  /** Fixed posting times (phase 3a); a post's time starts from the next free one. */
  postingSlots?: PostingSlot[];
  honestyRules: string;
  references: { url: string; note: string }[];
  lessons: BrandLesson[];
  pastScripts: string;
  qualityThreshold: number;
  /** The shape of the brand's carousels (phase 3c); 4:5 when not set. */
  carouselShape?: CarouselShape;
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
  | 'voice' | 'music' | 'broll' | 'clips' | 'assemble' | 'shorts' | 'carousel' | 'campaign' | 'quality' | 'publish';

/**
 * Voice, Music, B-roll and Assemble make the finished video file (phase 2a). The carousel
 * (phase 3c) sits just before Campaign: it follows the thumbnails in a run, but making one
 * must not put the voice-over or the finished video out of date.
 */
export const STEP_ORDER: StepId[] = [
  'brief', 'research', 'script', 'review', 'scenes', 'thumbnail', 'voice', 'music', 'broll', 'clips', 'assemble', 'shorts', 'carousel', 'campaign', 'quality', 'publish',
];

/**
 * Side pieces (phases 3c, 3d) made from the project but not from each other: one being
 * made again never puts another out of date.
 */
export const SIDE_STEPS: StepId[] = ['shorts', 'carousel'];

/** A Short's kind (phase 3d): its own mini-script, a highlight with a new hook, or a plain cut. */
export type ShortKind = 'mini' | 'highlight' | 'cut';

/** One Short as Miya planned it (phase 3d). */
export interface ShortPlan {
  id: string;
  kind: ShortKind;
  title: string;
  hook: string;
  seconds: number;
  platforms: PostPlatform[];
  copy: { platform: PostPlatform; title?: string; caption: string; hashtags: string[] }[];
  /** A mini-script Short's own script, with a picture for each part. */
  parts?: { spoken: string; imagePrompt: string; seconds: number }[];
  /** A highlight's or a cut's part of the finished video. */
  moment?: { startSec: number; endSec: number };
}

/** The Shorts' own AI clip setting (phase 3d), separate from the long video's. */
export interface ShortsSettings {
  aiClips: 'main' | 'every' | 'none';
  clipEngine: 'local' | 'runway' | null;
}

export const DEFAULT_SHORTS_SETTINGS: ShortsSettings = { aiClips: 'none', clipEngine: null };

/** One carousel slide (phase 3c): slide 1 is the cover. */
export interface CarouselSlide {
  id: string;
  cover: boolean;
  headline: string;
  body: string;
  imagePrompt: string;
}

/** A brand's carousel shape: 4:5 portrait (1080×1350) or 1:1 square (1080×1080). */
export type CarouselShape = '4:5' | '1:1';

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
  /** The project's posts (phase 3a), one per platform and piece. */
  posts?: ProjectPost[];
  createdAtMs: number;
  updatedAtMs: number;
  /** The Shorts' own AI clip setting (phase 3d). */
  shortsSettings?: ShortsSettings;
}

/** Where a post goes (phase 3a). */
export type PostPlatform = 'youtube' | 'instagram' | 'facebook';

/** A brand's fixed posting time: `day` 0 = Sunday … 6 = Saturday, `time` "HH:MM" local. */
export interface PostingSlot {
  platform: PostPlatform;
  day: number;
  time: string;
}

export type PostStatus =
  | 'draft' | 'approved' | 'scheduled' | 'posting' | 'posted' | 'locked_private'
  | 'waiting_app' | 'failed' | 'check' | 'cancelled' | 'ask' | 'over_limit' | 'by_hand';

/** One post of a project (phase 3a). `file` and `thumbnail` are relative to the output folder. */
export interface ProjectPost {
  id: string;
  platform: PostPlatform;
  piece: 'video' | 'short' | 'reel' | 'carousel';
  file: string;
  /** A carousel's slides in order (phase 3c); `file` is the first. */
  files?: string[];
  /** Where a post Alphonso could not send was saved to post by hand (phase 3c). */
  folder?: string;
  thumbnail?: string;
  title: string;
  caption: string;
  hashtags: string[];
  scheduledAtMs: number;
  status: PostStatus;
  /** The post on the platform, once there is one. */
  link?: string;
  /** The platform's own id (YouTube video, Facebook video, Instagram media). */
  platformId?: string;
  /** Why it failed, or what to do (a locked YouTube channel's Studio link). */
  reason?: string;
  /** When Alphonso sent it to the platform (phase 3b: counts toward the daily limit). */
  sentAtMs?: number;
  /** A vertical video's length (phase 3d), for each platform's limits. */
  seconds?: number;
  /** The Short this post is (phase 3d). */
  shortId?: string;
  /** Its numbers from the platform at each checkpoint (phase 4a). */
  metrics?: PostMetrics;
}

/** When a post's numbers are read (phase 4a): after 1 hour, 1 day, 7 days and 30 days. */
export type Checkpoint = '1h' | '1d' | '7d' | '30d';

export interface MetricsReading {
  readAtMs: number;
  /** The app's keys: views, reach, likes, comments, saves, shares, reactions, watchMinutes, … */
  values: Record<string, number>;
  /** Numbers the platform didn't give (shown as "—", never 0). */
  unavailable: string[];
}

export interface PostMetrics {
  readings: Partial<Record<Checkpoint, MetricsReading>>;
  /** Deleted on the platform: no more checkpoints. */
  removed?: boolean;
  /** A temporary refusal: try again after this. */
  retryAfterMs?: number;
  lastRefreshMs?: number;
  lastProblem?: string;
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
  /** Shorts only (phase 4a): add the one Short written to the chosen plan instead of saving a new version. */
  appendShort?: boolean;
  /** Not a factory step (phase 4a): lessons or ideas from a post's real numbers. */
  purpose?: 'lessons' | 'ideas';
  postRef?: { projectId: string; postId: string };
  /** Real web results Hector found (research steps): the only sources allowed. */
  sources?: { url: string; title: string; snippet: string }[];
}
