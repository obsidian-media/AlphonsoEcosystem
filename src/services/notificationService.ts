import { invoke } from '@tauri-apps/api/core';

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: number;
}

interface AppendOptions {
  type?: string;
  title?: string;
  message?: string;
}

const NOTIFICATIONS_KEY = 'alphonso_notifications_v1';
const MAX_NOTIFICATIONS = 50;

export async function sendNativeNotification(title: string, body: string): Promise<void> {
  try {
    await invoke('send_app_notification', { title: String(title), body: String(body) });
  } catch {
    // dev/browser fallback — no-op
  }
}

export function appendNotification(options: AppendOptions = {}): NotificationPayload {
  const { type = 'info', title = '', message = '' } = options;
  let existing: NotificationPayload[] = [];
  try { existing = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]'); } catch { existing = []; }
  const notification: NotificationPayload = {
    id: `notif-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    type: String(type),
    title: String(title).slice(0, 120),
    message: String(message).slice(0, 400),
    timestamp: Date.now()
  };
  existing.push(notification);
  if (existing.length > MAX_NOTIFICATIONS) existing.splice(0, existing.length - MAX_NOTIFICATIONS);
  try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(existing)); } catch { /* storage full */ }
  try { window.dispatchEvent(new CustomEvent('alphonso:notification', { detail: notification })); } catch { /* jsdom */ }
  return notification;
}

export function getNotifications(): NotificationPayload[] {
  try { return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]'); } catch { return []; }
}

export function clearNotifications(): void {
  try { localStorage.removeItem(NOTIFICATIONS_KEY); } catch { /* storage */ }
}