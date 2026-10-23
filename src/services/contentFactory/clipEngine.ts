// Which scenes get AI clips, and with which engine (Miya content factory
// phase 2b). The defaults come from what the user has: a local video model in
// their ComfyUI, else a Runway key, else no AI clips, saying how to set one up.
import type { VideoSettings } from './contentTypes';

export const NO_CLIP_ENGINE = 'Install a video model in Runtime Hub (ComfyUI), or add a Runway key in Connectors.';
const NO_LOCAL_MODEL = 'No video model is installed. Install one in Runtime Hub (ComfyUI).';

export interface ClipEngineChoice { engine: 'local' | 'runway' | null; reason?: string }

export function resolveClipEngine(
  settings: VideoSettings,
  have: { localModelInstalled: boolean; runway: { ok: boolean; reason?: string } },
): ClipEngineChoice {
  if (settings.clipEngine === 'local') return have.localModelInstalled ? { engine: 'local' } : { engine: null, reason: NO_LOCAL_MODEL };
  if (settings.clipEngine === 'runway') return have.runway.ok ? { engine: 'runway' } : { engine: null, reason: have.runway.reason };
  if (have.localModelInstalled) return { engine: 'local' };
  if (have.runway.ok) return { engine: 'runway' };
  return { engine: null, reason: NO_CLIP_ENGINE };
}

/** The scenes that get a clip: Miya's main moments (as the user left them), every scene, or none. */
export function chosenScenes<T extends { mainMoment?: unknown }>(scenes: T[], aiClips: VideoSettings['aiClips']): T[] {
  if (aiClips === 'none') return [];
  if (aiClips === 'every') return [...scenes];
  return scenes.filter((s) => s.mainMoment === true);
}
