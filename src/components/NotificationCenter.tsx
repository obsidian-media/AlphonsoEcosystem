import React, { useEffect, useRef } from 'react';

type NotificationType = 'success' | 'warning' | 'error' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
}

interface NotificationCenterProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

const STORAGE_KEY = 'alphonso_notifications_v1';

export function loadPersistedNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function clearPersistedNotifications(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* non-blocking */ }
}

const BORDER_COLOR: Record<NotificationType, string> = {
  success: 'border-[var(--success)]',
  warning: 'border-[var(--warning)]',
  error: 'border-[var(--error)]',
  info: 'border-[var(--info)]',
};

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export function NotificationCenter({ notifications, onDismiss, onClearAll }: NotificationCenterProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
      } catch { /* non-blocking */ }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [notifications]);

  if (!notifications || notifications.length === 0) {
    return null;
  }

  const visible = notifications.slice(0, 5);

  return (
    <div className="fixed top-4 right-4 z-50 w-80 flex flex-col gap-2 max-h-[80vh] overflow-y-auto">
      {notifications.length > 1 && (
        <button
          onClick={() => {
            clearPersistedNotifications();
            onClearAll();
          }}
          className="self-end text-xs text-[var(--text-3)] hover:text-[var(--text-2)] underline"
        >
          Clear all
        </button>
      )}
      {visible.map((n) => (
        <div
          key={n.id}
          className={`bg-[var(--surface-1)] border border-[var(--border)] border-l-4 ${BORDER_COLOR[n.type] ?? BORDER_COLOR.info} rounded-lg p-3 flex items-start gap-2 shadow-lg`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-1)] truncate">{n.title}</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">{n.message}</p>
            <p className="text-xs text-[var(--text-4)] mt-1">{relativeTime(n.timestamp)}</p>
          </div>
          <button
            onClick={() => onDismiss(n.id)}
            className="text-[var(--text-3)] hover:text-[var(--text-2)] text-xs flex-shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
