import { invoke } from '@tauri-apps/api/core';
import { getStorage, setStorage } from '../lib/appStorage';

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
