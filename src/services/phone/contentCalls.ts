// The content factory's phone calls (phone app, phase 2). Each maps to the function the
// computer's own Miya Studio or Calendar uses; a phone gets nothing the computer lacks.
import { mediaOffered, projectMedia, type MediaRef, type PhoneProject } from './contentMirror';
import { stepStamp, postStamp, postsStamp } from './contentStamps';
import { getProject, chooseVersion, createProject, emptyBrief } from '../contentFactory/contentProjectService';
import { approveContentStep, runContentProject } from '../contentFactory/contentStepRunner';
import { retryWithReason } from '../contentFactory/contentQualityGate';
import { updatePost } from '../contentFactory/contentPosts';
import { movePost, cancelProjectPost } from '../contentFactory/contentPostMoves';
import { getBrand } from '../contentFactory/contentBrandService';
import { projectName } from '../contentFactory/contentFromChat';
import type { ContentProject, ProjectPost, StepId } from '../contentFactory/contentTypes';
import { ensurePreview, readPiece, PREVIEW_PIECE_BYTES } from './phonePreviews';
import { previewFits } from './phoneLink';

type Args = Record<string, unknown>;

export const NOT_OFFERED = "That file isn't one this project offers.";

/** Said when previews would pass the relay's daily allowance (keeping room for approvals and chat). */
export function previewLimitLine(resetsAtMs: number | null): string {
  if (resetsAtMs == null) return "Today's limit for previews is used up; try again tomorrow.";
  const at = new Date(resetsAtMs);
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `Today's limit for previews is used up; it resets at ${hhmm}.`;
}

/** The sealed characters a piece of `raw` bytes becomes: base64 inside the message, sealed, then base64 again. */
function sealedChars(raw: number): number {
  return Math.ceil(((Math.ceil(raw / 3) * 4 + 512) * 4) / 3);
}

function mediaRef(value: unknown): MediaRef | null {
  const v = value as Partial<MediaRef> | null;
  if (!v || typeof v !== 'object') return null;
  if (typeof v.projectId !== 'string' || typeof v.path !== 'string') return null;
  if (v.kind !== 'video' && v.kind !== 'picture') return null;
  return { projectId: v.projectId, path: v.path, kind: v.kind };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type PreviewPiece = { mime: string; bytes: number; sha256: string; pieces: number; piece?: number; data?: string; pieceSha256?: string };

/** `media.preview`: `{ ref, info: true }` gives the size and hash; `{ ref, piece }` one piece of
 *  the phone-sized copy, with the SHA-256 of its text so the phone can spot a damaged piece. */
export async function mediaPreview(args: Args): Promise<PreviewPiece> {
  const ref = mediaRef(args.ref);
  if (!ref || !mediaOffered(ref)) throw new Error(NOT_OFFERED);
  const piece = Number(args.piece);
  const info = await ensurePreview(ref);
  if (info.ok === false) throw new Error(info.reason);
  if (args.info === true) return { mime: info.mime, bytes: info.bytes, sha256: info.sha256, pieces: info.pieces };
  if (!Number.isInteger(piece) || piece < 0 || piece >= info.pieces) throw new Error('That piece of the preview does not exist.');
  const raw = Math.min(PREVIEW_PIECE_BYTES, info.bytes - piece * PREVIEW_PIECE_BYTES);
  const fits = previewFits(sealedChars(raw));
  if (fits.ok === false) throw new Error(previewLimitLine(fits.resetsAtMs));
  const data = await readPiece(info.path, piece);
  return { mime: info.mime, bytes: info.bytes, sha256: info.sha256, pieces: info.pieces, piece, data, pieceSha256: await sha256Hex(data) };
}

// ---- Checking and approving the work ------------------------------------------------------

export const CHANGED_ON_COMPUTER = "This changed on your computer; here's the latest.";
export const PROJECT_GONE = "That project isn't on your computer any more.";
export const POST_GONE = "That post isn't on your computer any more.";
const ALREADY_DONE = 'Already done.'; // the same words as phoneCalls.ts
export { stepStamp, postStamp, postsStamp };

/** What "What to make" says for each tick on the phone (the computer's brief takes free text). */
const MAKE_OUTPUTS: Record<string, string> = { video: 'Long video', shorts: 'Shorts', carousel: 'carousel' };

let claimed = new Set<string>();
export function resetContentCallsForTests(): void { claimed = new Set(); }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function appSettings(): { outputFolder: string | null } {
  try {
    const s = JSON.parse(localStorage.getItem('alphonso_settings') || '{}') || {};
    return { outputFolder: typeof s.outputFolder === 'string' ? s.outputFolder : null };
  } catch { return { outputFolder: null }; }
}

function projectOf(args: Args): ContentProject {
  const project = getProject(str(args.projectId));
  if (!project) throw new Error(PROJECT_GONE);
  return project;
}

function latest(project: ContentProject): PhoneProject {
  return { ...project, media: projectMedia(project) };
}

export type ContentAnswer = { ok: true; latest: PhoneProject } | { stale: true; message: string; latest: PhoneProject };
const stale = (project: ContentProject): ContentAnswer => ({ stale: true, message: CHANGED_ON_COMPUTER, latest: latest(project) });

function postOf(project: ContentProject, args: Args): ProjectPost {
  const post = (project.posts || []).find((p) => p.id === str(args.postId));
  if (!post) throw new Error(POST_GONE);
  return post;
}

function after(projectId: string, done?: { ok: boolean; reason?: string }): ContentAnswer {
  if (done && done.ok === false) throw new Error(done.reason || 'That could not be done.');
  const project = getProject(projectId);
  if (!project) throw new Error(PROJECT_GONE);
  return { ok: true, latest: latest(project) };
}

async function stepCall(args: Args, act: (project: ContentProject, step: StepId) => unknown): Promise<ContentAnswer> {
  const project = projectOf(args);
  const step = str(args.step) as StepId;
  if (str(args.base) !== stepStamp(project, step)) return stale(project);
  await act(project, step);
  return after(project.id);
}

type Done = { ok: boolean; reason?: string };
async function postCall(args: Args, act: (project: ContentProject, post: ProjectPost) => Done | Promise<Done>): Promise<ContentAnswer> {
  const project = projectOf(args);
  const post = postOf(project, args);
  if (str(args.base) !== postStamp(post)) return stale(project);
  return after(project.id, await act(project, post));
}

export const CONTENT_CALLS = {
  'content.approveStep': (args: Args) => stepCall(args, (p, step) => approveContentStep(p.id, step, appSettings())),
  'content.sendBack': async (args: Args) => {
    const reason = str(args.reason).trim().slice(0, 2000);
    if (!reason) throw new Error('Say what to change.');
    // Runs on in the background, as Send back does on the computer; the step shows its progress.
    return stepCall(args, (p, step) => { void Promise.resolve(retryWithReason(p.id, step, reason, appSettings())).catch(() => undefined); });
  },
  'content.chooseVersion': (args: Args) => stepCall(args, (p, step) => chooseVersion(p.id, step, Number(args.version))),
  'content.editPost': (args: Args) => postCall(args, (p, post) => {
    const patch: Partial<ProjectPost> = {};
    if (typeof args.title === 'string') patch.title = args.title.slice(0, 500);
    if (typeof args.caption === 'string') patch.caption = args.caption.slice(0, 5000);
    if (Array.isArray(args.hashtags)) patch.hashtags = args.hashtags.filter((h): h is string => typeof h === 'string').slice(0, 60);
    return updatePost(p.id, post.id, patch);
  }),
  'content.movePost': (args: Args) => postCall(args, (p, post) => movePost(p.id, post.id, Number(args.atMs))),
  'content.cancelPost': (args: Args) => postCall(args, (p, post) => cancelProjectPost(p.id, post.id)),
  'content.approvePosts': async (args: Args) => {
    const project = projectOf(args);
    if (str(args.base) !== postsStamp(project)) return stale(project);
    const key = `${project.id}|${str(args.base)}`;
    if (claimed.has(key)) throw new Error(ALREADY_DONE);
    claimed.add(key);
    await approveContentStep(project.id, 'publish', appSettings());
    return after(project.id);
  },
  'content.startProject': async (args: Args) => {
    const brand = getBrand(str(args.brandId));
    if (!brand) throw new Error("That brand isn't on your computer any more.");
    const raw = str(args.idea).replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!raw) throw new Error('Type the idea first.');
    const idea = raw.charAt(0).toUpperCase() + raw.slice(1);
    const outputs = (Array.isArray(args.make) ? args.make : []).map((m) => MAKE_OUTPUTS[str(m)]).filter(Boolean);
    const project = createProject(brand.id, projectName(idea), { ...emptyBrief(), idea, outputs });
    const run = await runContentProject(project.id, { settings: appSettings() });
    if (!run.ok) throw new Error(run.reason || 'The project could not start.');
    return { ok: true, projectId: project.id, requestId: run.requestId };
  },
} satisfies Record<string, (args: Args) => Promise<unknown>>;
