import { invoke } from '@tauri-apps/api/core';

// Sends a native OS notification via the Tauri backend.
// Falls back silently in browser/dev mode where the bridge isn't available.
export async function sendNativeNotification(title, body) {
  try {
    await invoke('send_app_notification', { title: String(title), body: String(body) });
  } catch {
    // dev/browser fallback — no-op
  }
}

// ── In-app notification bus ────────────────────────────────────────────────────
// Stores notifications in localStorage so components can subscribe/poll.
// Type: 'info' | 'warning' | 'error' | 'success' | 'nova' | string

const NOTIFICATIONS_KEY = 'alphonso_notifications_v1';
const MAX_NOTIFICATIONS = 50;

export function appendNotification({ type = 'info', title = '', message = '' } = {}) {
  let existing = [];
  try { existing = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]'); } catch { existing = []; }
  const notification = {
    id: `notif-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type: String(type),
    title: String(title).slice(0, 120),
    message: String(message).slice(0, 400),
    timestamp: Date.now()
  };
  existing.push(notification);
  if (existing.length > MAX_NOTIFICATIONS) existing.splice(0, existing.length - MAX_NOTIFICATIONS);
  try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(existing)); } catch { /* storage full */ }
  // Dispatch a storage event for cross-component reactivity (same tab via custom event)
  try { window.dispatchEvent(new CustomEvent('alphonso:notification', { detail: notification })); } catch { /* jsdom */ }
  return notification;
}

export function getNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]'); } catch { return []; }
}

export function clearNotifications() {
  try { localStorage.removeItem(NOTIFICATIONS_KEY); } catch { /* storage */ }
}
