import { invoke } from '@tauri-apps/api/core';
import { getStorage, setStorage } from '../lib/appStorage';
import { installTool } from './runtimeManagerService';
import type { PrereqStatus } from './runtimeManagerService';
import { pullOllamaModel, fetchOllamaModels, getConfiguredOllamaEndpoint } from '../lib/ollama';

const SETUP_COMPLETE_KEY = 'alphonso_setup_complete_v1';
/** OnboardingWizard's flag, kept for upgrade migration only — see isSetupComplete(). */
const LEGACY_ONBOARDING_COMPLETE_KEY = 'alphonso_onboarding_complete_v1';
// Flat GB buffer kept free beyond the sum of selected components, so a
// download never runs a drive down to exactly zero bytes free (which can
// itself cause unrelated OS/app failures well before disk is truly full).
const DISK_SAFETY_BUFFER_GB = 10;

export interface HardwareProfile {
  ramGb: number;
  /**
   * Free disk space in GB, or `null` when detection failed / was unavailable.
   * `null` is deliberately distinct from `0`: zero means "the drive really is
   * full" (block installs), null means "we don't know" (don't block on a
   * number we never measured). checkDiskSpace() treats them differently.
   */
  diskFreeGb: number | null;
  /**
   * Free space (GB) on the volume the starter model is actually pulled onto
   * by Ollama — resolved only when `OLLAMA_MODELS` is explicitly set on the
   * machine, since that's the one case the real target directory is known
   * with certainty rather than guessed at. `null` here means "not checked",
   * not "unknown but assume it's fine" — the common case (env var unset)
   * always reports `null`, matching how `diskFreeGb` already distinguishes
   * "don't know" from a real measurement. checkDiskSpace() only uses this
   * when it's a real number.
   */
  ollamaModelsDirFreeGb: number | null;
  gpuPresent: boolean;
  gpuVendor: string | null;
  gpuModel: string | null;
}

/**
 * How long any single Setup probe may hang before we give up on it.
 * Without this, a non-Tauri host (a plain browser — which is exactly what
 * `npm run dev` and the Playwright E2E suite use) leaves `invoke()` pending
 * forever: it neither resolves nor rejects, so a bare `.catch()` never runs
 * and Setup sits on "Scanning your system…" permanently.
 */
export const SCAN_TIMEOUT_MS = 10_000;

/** Rejects if `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms = SCAN_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function scanHardware(): Promise<HardwareProfile> {
  return withTimeout(invoke<HardwareProfile>('setup_scan_hardware'));
}

export interface SelectableComponent {
  id: string;
  sizeGb: number;
}

/**
 * Component id for the bundled default LLM. Deliberately NOT a Runtime Hub
 * tool name: models and tools install by completely different mechanisms
 * (`ollama pull` into ollama's own store vs. git-clone/pip/docker into
 * `runtimes_dir()`), and are checked for pre-existence differently too
 * (`/api/tags` vs. Runtime Hub's installed-tool list).
 *
 * This distinction previously did not exist, and it was a real bug: this id
 * was passed straight to `installTool()`, whose Rust side resolves names via
 * `tool_def()` and returns `Unknown tool: starter-model`. Because the starter
 * model is in every intent path, that failed the first queued item for every
 * user. Route through `installComponent()` below, never `installTool()`
 * directly.
 */
export const STARTER_MODEL_ID = 'starter-model';

/**
 * The ollama tag actually pulled for STARTER_MODEL_ID.
 *
 * Kept as a single exported constant so the tag, the recommendation screen's
 * displayed size, and the already-installed check can't drift apart. If
 * `docs/DEPENDENCY_BUNDLING_PLAN.md`'s `O2` (choose + bundle a default model)
 * lands on a different model, change it here — this is the only place that
 * needs to know.
 */
export const STARTER_MODEL_TAG = 'llama3.2:3b';

export interface ComponentProgress {
  /** Human-readable status, already including a formatted byte count when
   * the underlying mechanism reports real bytes (Ollama's model pull does;
   * Runtime Hub's tool installs generally don't, and just send a stage
   * description instead — both flow through this one shape). */
  message: string;
  /** 0-100, or null when the underlying mechanism can't report a percent
   * for this event (e.g. Ollama's "verifying sha256 digest" phase has no
   * byte total to divide by). Distinct from 0 -- a null percent should
   * leave a progress bar wherever it last was, not snap it back to empty. */
  pct: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

/**
 * Installs one Setup component, routing models and tools to their real,
 * separate install mechanisms rather than assuming everything is a tool.
 *
 * Both `pullOllamaModel` (the starter model) and `installTool` (everything
 * else) already had real progress-reporting support -- Ollama's pull API
 * streams real completed/total byte counts, and Runtime Hub emits real
 * `runtime://progress` events with a stage + percent -- but neither was
 * ever wired to a caller here. `onProgress` normalizes both into one shape
 * so `InstallQueue.tsx` doesn't need to know which mechanism a given
 * component uses.
 */
export async function installComponent(
  componentId: string,
  onProgress?: (progress: ComponentProgress) => void
): Promise<void> {
  if (componentId === STARTER_MODEL_ID) {
    await pullOllamaModel({
      endpoint: getConfiguredOllamaEndpoint(),
      model: STARTER_MODEL_TAG,
      onProgress: onProgress
        ? (p) => onProgress({
            message: p.completed != null && p.total != null
              ? `${p.status} (${formatBytes(p.completed)} / ${formatBytes(p.total)})`
              : p.status,
            pct: p.percent,
          })
        : undefined,
    });
    return;
  }
  await installTool(
    componentId,
    onProgress ? (p) => onProgress({ message: p.message, pct: p.pct }) : undefined
  );
}

/**
 * Whether a component is already present, asked in whichever way is correct
 * for that component's kind.
 *
 * `installedToolNames` comes from Runtime Hub's `getAllStatus()`, which has no
 * knowledge of ollama's model store — so the starter model must be checked
 * against `/api/tags` instead. A failed check resolves false rather than
 * throwing: worst case we re-pull a model that already exists, which ollama
 * itself treats as a no-op, and that is much better than breaking the
 * recommendation screen over an unreachable ollama.
 */
export async function isComponentAlreadyInstalled(
  componentId: string,
  installedToolNames: Set<string>
): Promise<boolean> {
  if (componentId !== STARTER_MODEL_ID) {
    return installedToolNames.has(componentId);
  }
  try {
    const { models } = await fetchOllamaModels(getConfiguredOllamaEndpoint());
    return models.some((m) => m.name === STARTER_MODEL_TAG);
  } catch {
    return false;
  }
}

export interface DiskSpaceCheck {
  ok: boolean;
  /** Raw sum of selected components' sizes, with no safety buffer added. */
  neededGb: number;
  /**
   * What the UI should actually tell the user to have free — neededGb plus
   * the safety buffer. Always use this for "make sure you have at least
   * N GB free" copy; neededGb alone understates the real requirement (a
   * real bug in an earlier version of this file, caught in review — the
   * unknown-disk-space warning quoted neededGb, telling a user "15GB" when
   * the real requirement was 25GB).
   */
  requiredGb: number;
  shortfallGb: number;
  /** True when free space is unknown, so `ok` is a pass-through, not a measurement. */
  unknown: boolean;
  /**
   * How short the starter model's OWN volume is, in GB — set only when the
   * starter model is selected AND that volume could be resolved with
   * certainty (`ollamaModelsDirFreeGb` was a real number, meaning
   * `OLLAMA_MODELS` was explicitly set) AND it doesn't have room. Absent
   * (not 0) in every other case, including the common one — starter model
   * selected but `OLLAMA_MODELS` unset — which is deliberately never
   * flagged here rather than checked against a guessed default path. See
   * `HardwareProfile.ollamaModelsDirFreeGb`'s doc comment for why.
   */
  starterModelShortfallGb?: number;
}

/**
 * How short the starter model's own volume is, in GB, or `undefined` when
 * there's nothing to flag (not selected, or that volume isn't known with
 * certainty). Split out from checkDiskSpace so each concern stays a small,
 * independently-readable pure function rather than one larger one.
 */
function computeStarterModelShortfall(
  selected: SelectableComponent[],
  ollamaModelsDirFreeGb: number | null | undefined
): number | undefined {
  if (ollamaModelsDirFreeGb == null) return undefined;
  const starter = selected.find((c) => c.id === STARTER_MODEL_ID);
  if (!starter) return undefined;
  const shortfall = starter.sizeGb + DISK_SAFETY_BUFFER_GB - ollamaModelsDirFreeGb;
  return shortfall > 0 ? shortfall : undefined;
}

/**
 * Sums the selected components' sizes plus a fixed safety buffer and
 * compares against free disk space. Pure function — no I/O — so the
 * Recommended Setup screen can call it synchronously on every selection
 * change without re-querying the filesystem each time.
 *
 * A `null` freeGb (detection failed — see HardwareProfile.diskFreeGb) does
 * NOT block installation: refusing to install because we couldn't measure
 * the disk would be worse than letting the real install surface a real
 * out-of-space error. It's reported via `unknown` so the UI can warn.
 *
 * `ollamaModelsDirFreeGb` is optional and purely additive: passing it (or
 * leaving it undefined/null) never changes the existing `neededGb`/
 * `requiredGb`/`shortfallGb`/`unknown` behavior for the general
 * (`runtimes_dir()`-backed) check — it only adds a second, independent
 * starter-model-specific check that can ALSO block `ok`, surfaced via
 * `starterModelShortfallGb`.
 */
export function checkDiskSpace(
  selected: SelectableComponent[],
  freeGb: number | null,
  ollamaModelsDirFreeGb?: number | null
): DiskSpaceCheck {
  const neededGb = selected.reduce((sum, c) => sum + c.sizeGb, 0);
  const requiredGb = neededGb + DISK_SAFETY_BUFFER_GB;
  const starterModelShortfallGb = computeStarterModelShortfall(selected, ollamaModelsDirFreeGb);

  if (freeGb === null) {
    return {
      ok: starterModelShortfallGb === undefined,
      neededGb,
      requiredGb,
      shortfallGb: 0,
      unknown: true,
      starterModelShortfallGb,
    };
  }
  const shortfallGb = Math.max(0, requiredGb - freeGb);
  return {
    ok: shortfallGb === 0 && starterModelShortfallGb === undefined,
    neededGb,
    requiredGb,
    shortfallGb,
    unknown: false,
    starterModelShortfallGb,
  };
}

/**
 * True if this install has already been through first-run setup.
 *
 * Honours the legacy `alphonso_onboarding_complete_v1` key that
 * OnboardingWizard used before Setup replaced it: an existing user who
 * already completed onboarding must NOT be dropped back into a first-run
 * flow just because they upgraded. The legacy value is migrated forward on
 * read so this only costs one check per install, not forever.
 */
export type PrereqKind = 'python' | 'docker';

/**
 * Which prerequisite each Setup component genuinely needs, per
 * `runtime_manager.rs`'s `TOOLS` array (`exe: "python"` for fooocus/voice-os,
 * `exe: "docker"` for chromadb) — not guessed from the component name.
 * Components absent from this map (the starter model, and any future
 * component that needs neither) are never blocked.
 */
const COMPONENT_PREREQ: Partial<Record<string, PrereqKind>> = {
  fooocus: 'python',
  'voice-os': 'python',
  chromadb: 'docker',
};

/**
 * The prerequisite blocking a component's install, or `null` if it can
 * proceed. Pure — takes a `PrereqStatus` rather than re-querying, so
 * `RecommendedSetup` can recompute this on every render (e.g. right after
 * the user installs Python) without another Tauri round-trip.
 *
 * A `PrereqStatus` that omits a flag entirely (e.g. a degraded scan) is
 * treated as "missing," never as "present" — silently queuing an install
 * whose prerequisite we never actually confirmed is exactly the class of bug
 * `starter-model` was.
 */
export function getUnmetPrereq(componentId: string, prereqs: PrereqStatus): PrereqKind | null {
  const required = COMPONENT_PREREQ[componentId];
  if (!required) return null;
  if (required === 'python') return prereqs.pythonFound === true ? null : 'python';
  return prereqs.dockerFound === true ? null : 'docker';
}

export function isSetupComplete(): boolean {
  if (getStorage(SETUP_COMPLETE_KEY, false)) return true;
  if (getStorage(LEGACY_ONBOARDING_COMPLETE_KEY, false)) {
    setStorage(SETUP_COMPLETE_KEY, true);
    return true;
  }
  return false;
}

export function markSetupComplete(): void {
  setStorage(SETUP_COMPLETE_KEY, true);
}
