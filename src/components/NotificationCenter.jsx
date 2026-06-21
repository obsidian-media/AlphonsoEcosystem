import React from 'react';

const BORDER_COLOR = {
  success: 'border-emerald-500',
  warning: 'border-amber-500',
  error: 'border-red-500',
  info: 'border-zinc-500',
};

function relativeTime(timestamp) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export function NotificationCenter({ notifications, onDismiss, onClearAll }) {
  if (!notifications || notifications.length === 0) return null;

  const visible = notifications.slice(0, 5);

  return (
    <div className="fixed top-4 right-4 z-50 w-80 flex flex-col gap-2 max-h-[80vh] overflow-y-auto">
      {notifications.length > 1 && (
        <button
          onClick={onClearAll}
          className="self-end text-xs text-zinc-400 hover:text-zinc-200 underline"
        >
          Clear all
        </button>
      )}
      {visible.map((n) => (
        <div
          key={n.id}
          className={`bg-zinc-900 border border-zinc-700 border-l-4 ${BORDER_COLOR[n.type] || BORDER_COLOR.info} rounded-lg p-3 flex items-start gap-2 shadow-lg`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-zinc-100 truncate">{n.title}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{n.message}</p>
            <p className="text-xs text-zinc-600 mt-1">{relativeTime(n.timestamp)}</p>
          </div>
          <button
            onClick={() => onDismiss(n.id)}
            className="text-zinc-500 hover:text-zinc-200 text-xs flex-shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
