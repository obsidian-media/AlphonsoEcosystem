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

/**
 * Installs one Setup component, routing models and tools to their real,
 * separate install mechanisms rather than assuming everything is a tool.
 */
export async function installComponent(componentId: string): Promise<void> {
  if (componentId === STARTER_MODEL_ID) {
    await pullOllamaModel({
      endpoint: getConfiguredOllamaEndpoint(),
      model: STARTER_MODEL_TAG,
    });
    return;
  }
  await installTool(componentId);
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
  neededGb: number;
  shortfallGb: number;
  /** True when free space is unknown, so `ok` is a pass-through, not a measurement. */
  unknown: boolean;
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
 */
export function checkDiskSpace(selected: SelectableComponent[], freeGb: number | null): DiskSpaceCheck {
  const neededGb = selected.reduce((sum, c) => sum + c.sizeGb, 0);
  if (freeGb === null) {
    return { ok: true, neededGb, shortfallGb: 0, unknown: true };
  }
  const requiredWithBuffer = neededGb + DISK_SAFETY_BUFFER_GB;
  const shortfallGb = Math.max(0, requiredWithBuffer - freeGb);
  return { ok: shortfallGb === 0, neededGb, shortfallGb, unknown: false };
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
