import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const COACH_LABEL = 'coach';

function coachUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set('coach', '1');
  const stored = localStorage.getItem('alphonso_settings');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.coachAgent) {
        url.searchParams.set('coachAgent', String(parsed.coachAgent));
      }
    } catch {
      // Ignore parse errors and fall back to defaults.
    }
  }
  return url.toString();
}

export async function openCoachWindow(alwaysOnTop?: boolean, coachAgent = 'alphonso') {
  try {
    const stored = localStorage.getItem('alphonso_settings');
    const parsed = stored ? JSON.parse(stored) : {};
    const next = {
      ...parsed,
      coachAgent
    };
    localStorage.setItem('alphonso_settings', JSON.stringify(next));
    try {
      await invoke('kv_set', { key: 'alphonso_settings', value: JSON.stringify(next) });
    } catch { /* SQLite write best-effort */ }
  } catch {
    // Ignore storage failures in restricted runtimes.
  }

  const existing = await WebviewWindow.getByLabel(COACH_LABEL).catch(() => null);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    await existing.setAlwaysOnTop(Boolean(alwaysOnTop));
    return existing;
  }

  const coach = new WebviewWindow(COACH_LABEL, {
    title: 'Alphonso Coach',
    url: coachUrl(),
    width: 340,
    height: 430,
    minWidth: 280,
    minHeight: 360,
    resizable: true,
    decorations: true,
    alwaysOnTop: Boolean(alwaysOnTop),
    skipTaskbar: false
  });

  return coach;
}

export async function closeCoachWindow() {
  const existing = await WebviewWindow.getByLabel(COACH_LABEL).catch(() => null);
  if (existing) {
    await existing.close();
  }
}
