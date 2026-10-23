// A Runway clip for one scene (Miya content factory phase 2b): image-to-video
// from the scene's picture. Paid, so: available only with a key, Zero-Cost Mode
// off and the price per second you entered; the step asked once for the run
// (its `spend` effect); each clip is checked against the shared monthly cap
// before anything is sent, and its cost recorded when it is made.
import { getConnectorCredential } from '../connectors/connectorAuth';
import { canSpend, getPaidModelSettings, recordSpendUsd } from '../jose/joseSpend';
import { generateRunwayVideo } from '../runwayService';
import { loadProjectImage } from './contentProjectFiles';

export const RUNWAY_DEFAULT_MODEL = 'gen4_turbo';
const RUNWAY_TIMEOUT_SECONDS = 1800;

function zeroCostModeOn(): boolean {
  try {
    return JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.zeroCostMode !== false;
  } catch {
    return true;
  }
}

export function runwayClipAvailable(): { ok: boolean; reason?: string } {
  if (!getConnectorCredential('runway', 'RUNWAYML_API_SECRET')) return { ok: false, reason: 'Add a Runway key in Connectors.' };
  if (zeroCostModeOn()) return { ok: false, reason: 'Zero-Cost Mode is on; turn it off in Settings to use Runway.' };
  if (getPaidModelSettings().runwayPricePerSecondUsd === null) {
    return { ok: false, reason: "Enter Runway's price per second in Settings → Approvals → Allow paid models." };
  }
  return { ok: true };
}

/** Runway makes 5 or 10 second clips: the shorter that covers the scene. */
export function runwayClipSeconds(sceneSeconds: number): 5 | 10 {
  return sceneSeconds <= 5 ? 5 : 10;
}

/** The cost of clips for scenes of these lengths at your price, or null without a price. */
export function estimateRunwayUsd(sceneSeconds: number[]): number | null {
  const price = getPaidModelSettings().runwayPricePerSecondUsd;
  if (price === null) return null;
  return sceneSeconds.reduce((sum, s) => sum + runwayClipSeconds(s) * price, 0);
}

function join(root: string, rel: string): string {
  const sep = root.includes('\\') || /^[a-zA-Z]:/.test(root) ? '\\' : '/';
  return [root.replace(/[\\/]+$/, ''), ...rel.split('/')].join(sep);
}

/** A saved file's path relative to the output folder, or null when it is outside it. */
function relativeTo(root: string, file: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = `${norm(root)}/`;
  const path = norm(file);
  return path.toLowerCase().startsWith(base.toLowerCase()) ? path.slice(base.length) : null;
}

export interface RunwayClipInput {
  root: string;
  imageRel: string;
  /** The project's clips folder, relative to the output folder. */
  outDirRel: string;
  prompt: string;
  seconds: number;
  vertical: boolean;
  model: string;
}

export interface RunwayClipResult { status: 'done' | 'failed'; path?: string; costUsd?: number; error?: string }

export async function makeRunwayClip(input: RunwayClipInput): Promise<RunwayClipResult> {
  const duration = runwayClipSeconds(input.seconds);
  const cost = estimateRunwayUsd([input.seconds]);
  if (cost === null) return { status: 'failed', error: runwayClipAvailable().reason };
  const allowed = canSpend(cost);
  if (!allowed.ok) return { status: 'failed', error: allowed.reason };
  const image = await loadProjectImage(input.root, input.imageRel);
  if (!image) return { status: 'failed', error: 'This scene has no picture to start from.' };
  try {
    const result = await generateRunwayVideo(
      {
        promptText: input.prompt.slice(0, 1000),
        promptImage: image,
        model: input.model || RUNWAY_DEFAULT_MODEL,
        ratio: input.vertical ? '720:1280' : '1280:720',
        duration,
        outputDir: join(input.root, input.outDirRel),
        timeoutSeconds: RUNWAY_TIMEOUT_SECONDS,
      },
      // You approved this run's Runway clips once, with the estimate (the step's spend effect).
      { approved: true, requestedBy: 'miya', reason: 'AI clips for the finished video' },
    );
    if (!result?.ok) {
      const error = String(result?.error || result?.message || 'Runway made no clip.');
      return { status: 'failed', error: /timed out/i.test(error) ? `${error} Runway may still charge for this clip; check your Runway account.` : error };
    }
    // Runway made the clip, so it was paid for, whatever happens next.
    recordSpendUsd(cost);
    const saved = (result.outputFiles || [])[0];
    const rel = saved ? relativeTo(input.root, saved) : null;
    if (!rel) return { status: 'failed', error: 'Runway saved the clip outside the project folder.' };
    return { status: 'done', path: rel, costUsd: cost };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}
