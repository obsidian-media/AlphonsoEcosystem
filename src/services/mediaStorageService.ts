// The user's own S3-compatible storage (content factory phase 3c, owner): optional,
// used only to hand a file to a platform that takes media by a link (Instagram
// carousels, Reels on Instagram Login). The bucket stays private: the backend uploads
// the file and returns a link that works for an hour; the file is deleted once the
// platform has it, and leftovers older than a day are deleted at start. Keys are
// saved in Settings → Connectors → Your storage (connector `media_storage`).
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectors/connectorAuth';
import { randomHex } from '../lib/randomId';

export const STORAGE_CONNECTOR = 'media_storage';
export const STAGED_PREFIX = 'alphonso-staged/';
export const NO_STORAGE = 'No storage is set up.';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  pathStyle: boolean;
}

export interface StageResult { ok: boolean; url?: string; key?: string; reason?: string }
export interface StoragePart { ok: boolean; reason?: string }
export interface StorageTestResult { upload: StoragePart; link: StoragePart; delete: StoragePart }

function read(key: string): string {
  return String(getConnectorCredential(STORAGE_CONNECTOR, key) || '').trim();
}

/** The saved storage settings, or null when anything needed is missing. */
export function storageConfig(): StorageConfig | null {
  const config = {
    endpoint: read('STORAGE_ENDPOINT'),
    region: read('STORAGE_REGION'),
    bucket: read('STORAGE_BUCKET'),
    accessKey: read('STORAGE_ACCESS_KEY'),
    secretKey: read('STORAGE_SECRET_KEY'),
    pathStyle: read('STORAGE_PATH_STYLE').toLowerCase() === 'true',
  };
  return config.endpoint && config.bucket && config.accessKey && config.secretKey ? config : null;
}

export async function storageConfigured(): Promise<boolean> {
  return storageConfig() !== null;
}

/** `alphonso-staged/<yyyy-mm-dd>/<random>-<safe file name>`. */
export function stagedKey(relativePath: string, nowMs = Date.now()): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const name = (relativePath.split(/[\\/]/).pop() || 'file').replace(/[^A-Za-z0-9._-]+/g, '-');
  const random = randomHex(8).padEnd(8, '0');
  return `${STAGED_PREFIX}${day}/${random}-${name}`;
}

/** Uploads a file from the workspace; returns the link the platform can read for an hour. */
export async function stageFile(root: string, relativePath: string, nowMs = Date.now()): Promise<StageResult> {
  const config = storageConfig();
  if (!config) return { ok: false, reason: NO_STORAGE };
  const key = stagedKey(relativePath, nowMs);
  try {
    const result = await invoke<StageResult>('storage_put_file', { config, workspaceRoot: root, relativePath, key });
    return result?.ok && result.url ? { ok: true, url: result.url, key } : { ok: false, reason: result?.reason || 'The file could not be put in your storage.' };
  } catch {
    return { ok: false, reason: 'The file could not be put in your storage.' };
  }
}

/** Deletes a staged file; never throws (a leftover is cleaned at the next start). */
export async function removeStaged(key: string): Promise<void> {
  const config = storageConfig();
  if (!config || !key) return;
  try {
    await invoke('storage_delete', { config, key });
  } catch {
    // Cleaned up at the next start.
  }
}

/** Deletes staged files older than a day; returns how many. */
export async function cleanOldStaged(nowMs = Date.now()): Promise<number> {
  const config = storageConfig();
  if (!config) return 0;
  try {
    const items = await invoke<{ key: string; lastModified: string }[]>('storage_list_staged', { config, prefix: STAGED_PREFIX });
    let removed = 0;
    for (const item of items || []) {
      const at = Date.parse(item.lastModified);
      if (!Number.isFinite(at) || nowMs - at < DAY_MS) continue;
      await removeStaged(item.key);
      removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Settings' Test: upload, link and delete, each with its result. */
export async function testStorage(): Promise<StorageTestResult> {
  const config = storageConfig();
  const missing = { ok: false, reason: 'Fill in the address, bucket, access key and secret key first.' };
  if (!config) return { upload: missing, link: missing, delete: missing };
  return invoke<StorageTestResult>('storage_test', { config });
}
