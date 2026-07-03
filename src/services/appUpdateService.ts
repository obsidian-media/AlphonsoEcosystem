import { invoke } from '@tauri-apps/api/core';
import { TRUST_STATES } from './trustModel';

const UPDATE_NOTICE_KEY = 'alphonso_update_notice_v1';

export interface UpdateNotice {
  latestVersion: string;
  noticedAtMs: number;
}

export interface UpdateCheckInput {
  endpoint?: string | null;
  pubkey?: string | null;
  target?: string | null;
}

export interface UpdateCheckResult {
  configured: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  pubDate: string | null;
  downloadUrl: string | null;
  checkedAtMs: number;
  trust: string;
  error?: string;
}

export function getLastUpdateNotice(): UpdateNotice | null {
  try {
    const raw = localStorage.getItem(UPDATE_NOTICE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getLastUpdateNoticeAsync(): Promise<UpdateNotice | null> {
  try {
    const raw = await invoke<string | null>('kv_get', { key: UPDATE_NOTICE_KEY });
    if (raw) return JSON.parse(raw);
  } catch { /* fall back to localStorage below */ }
  return getLastUpdateNotice();
}

export function setLastUpdateNotice(payload: UpdateNotice): void {
  localStorage.setItem(UPDATE_NOTICE_KEY, JSON.stringify(payload));
  invoke('kv_set', { key: UPDATE_NOTICE_KEY, value: JSON.stringify(payload) }).catch(() => {});
}

export async function checkAppUpdate({ endpoint, pubkey, target }: UpdateCheckInput = {}): Promise<UpdateCheckResult> {
  try {
    const proof: any = await invoke('check_app_update', {
      endpoint: endpoint || null,
      pubkey: pubkey || null,
      target: target || null
    });
    return {
      ...proof,
      trust: proof?.trust || TRUST_STATES.UNVERIFIED
    };
  } catch (error) {
    return {
      configured: false,
      available: false,
      currentVersion: '',
      latestVersion: null,
      notes: null,
      pubDate: null,
      downloadUrl: null,
      checkedAtMs: Date.now(),
      trust: TRUST_STATES.FAILED,
      error: String(error)
    };
  }
}

export async function notifyUpdateAvailable(update: UpdateCheckResult): Promise<boolean> {
  if (!update?.available || !update?.latestVersion) return false;
  if (!('Notification' in window)) return false;

  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      return false;
    }
  }

  if (Notification.permission !== 'granted') return false;

  const lastNotice = getLastUpdateNotice();
  if (lastNotice?.latestVersion === update.latestVersion) return false;

  try {
    const body = `Alphonso ${update.latestVersion} is available.`;
    const notification = new Notification('Update Available', { body });
    notification.onclick = () => {
      if (update.downloadUrl) {
        window.open(update.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    };
    setLastUpdateNotice({
      latestVersion: update.latestVersion,
      noticedAtMs: Date.now()
    });
    return true;
  } catch {
    return false;
  }
}
