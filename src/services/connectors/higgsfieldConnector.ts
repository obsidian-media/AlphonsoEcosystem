// Higgsfield (content factory phase 4b): pictures and AI clips from model ids the user pastes
// from the Higgsfield Console, each with an optional "Extra settings (JSON)" box. Making
// anything runs inside an approved content step through the backend (`higgsfield.rs`), which
// asks Higgsfield's own estimate first; this file only reads the settings and runs Test.
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';
import { getRuntimePolicySettings } from '../policyEnforcementService';

export const HIGGSFIELD_NOT_SET_UP = 'Add your Higgsfield key id and secret in Settings → Connectors → Higgsfield.';
export const HIGGSFIELD_CONSOLE_URL = 'https://cloud.higgsfield.ai';

export interface HiggsfieldKeys { keyId: string; keySecret: string }
export interface HiggsfieldModels {
  picture?: string;
  pictureExtra?: Record<string, unknown>;
  pictureExtraProblem?: string;
  clip?: string;
  clipExtra?: Record<string, unknown>;
  clipExtraProblem?: string;
}

const read = (key: string): string => String(getConnectorCredential('higgsfield', key) || '').trim();

export function higgsfieldKeys(): HiggsfieldKeys {
  return { keyId: read('HIGGSFIELD_KEY_ID'), keySecret: read('HIGGSFIELD_KEY_SECRET') };
}

export function isHiggsfieldConfigured(): boolean {
  const k = higgsfieldKeys();
  return Boolean(k.keyId && k.keySecret);
}

/** Keys set and Zero-Cost Mode off; spending is still asked per run. */
export function higgsfieldAvailable(): { ok: boolean; reason?: string } {
  if (!isHiggsfieldConfigured()) return { ok: false, reason: HIGGSFIELD_NOT_SET_UP };
  if (getRuntimePolicySettings().zeroCostMode) return { ok: false, reason: 'Higgsfield is off while Zero-Cost Mode is on.' };
  return { ok: true };
}

/** An extra settings box: empty → nothing; a JSON object → used; anything else → a problem to show. */
export function parseExtra(text: string, what: string): { extra?: Record<string, unknown>; problem?: string } {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return { extra: value as Record<string, unknown> };
  } catch {
    // Reported below.
  }
  return { problem: `The ${what} model’s extra settings are not valid JSON.` };
}

export function higgsfieldModels(): HiggsfieldModels {
  const out: HiggsfieldModels = {};
  const picture = read('HIGGSFIELD_PICTURE_MODEL');
  const clip = read('HIGGSFIELD_CLIP_MODEL');
  if (picture) {
    out.picture = picture;
    const p = parseExtra(read('HIGGSFIELD_PICTURE_EXTRA'), 'picture');
    if (p.extra) out.pictureExtra = p.extra;
    if (p.problem) out.pictureExtraProblem = p.problem;
  }
  if (clip) {
    out.clip = clip;
    const c = parseExtra(read('HIGGSFIELD_CLIP_EXTRA'), 'clip');
    if (c.extra) out.clipExtra = c.extra;
    if (c.problem) out.clipExtraProblem = c.problem;
  }
  return out;
}

/** Settings' Test: Higgsfield's estimate for a model id; nothing is made or charged. */
export async function testHiggsfieldModel(model: string, extra?: Record<string, unknown>): Promise<{ ok: boolean; usd?: number; reason?: string }> {
  if (!isHiggsfieldConfigured()) return { ok: false, reason: HIGGSFIELD_NOT_SET_UP };
  try {
    return (await invoke('higgsfield_test', { model, extra: extra ?? null, keys: higgsfieldKeys() })) as { ok: boolean; usd?: number; reason?: string };
  } catch {
    return { ok: false, reason: 'Higgsfield could not be reached.' };
  }
}
