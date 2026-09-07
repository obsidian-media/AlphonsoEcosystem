import { invoke } from '@tauri-apps/api/core';
import { getStorage, setStorage } from '../lib/appStorage';

const SETUP_COMPLETE_KEY = 'alphonso_setup_complete_v1';
// Flat GB buffer kept free beyond the sum of selected components, so a
// download never runs a drive down to exactly zero bytes free (which can
// itself cause unrelated OS/app failures well before disk is truly full).
const DISK_SAFETY_BUFFER_GB = 10;

export interface HardwareProfile {
  ramGb: number;
  diskFreeGb: number;
  gpuPresent: boolean;
  gpuVendor: string | null;
  gpuModel: string | null;
}

export async function scanHardware(): Promise<HardwareProfile> {
  return invoke('setup_scan_hardware');
}

export interface SelectableComponent {
  id: string;
  sizeGb: number;
}

export interface DiskSpaceCheck {
  ok: boolean;
  neededGb: number;
  shortfallGb: number;
}

/**
 * Sums the selected components' sizes plus a fixed safety buffer and
 * compares against free disk space. Pure function — no I/O — so the
 * Recommended Setup screen can call it synchronously on every selection
 * change without re-querying the filesystem each time.
 */
export function checkDiskSpace(selected: SelectableComponent[], freeGb: number): DiskSpaceCheck {
  const neededGb = selected.reduce((sum, c) => sum + c.sizeGb, 0);
  const requiredWithBuffer = neededGb + DISK_SAFETY_BUFFER_GB;
  const shortfallGb = Math.max(0, requiredWithBuffer - freeGb);
  return { ok: shortfallGb === 0, neededGb, shortfallGb };
}

export function isSetupComplete(): boolean {
  return getStorage(SETUP_COMPLETE_KEY, false);
}

export function markSetupComplete(): void {
  setStorage(SETUP_COMPLETE_KEY, true);
}
