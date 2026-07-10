import React from 'react';

interface UpdaterNotificationProps {
  version: string | null | undefined;
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdaterNotification({ version, onUpdate, onDismiss }: UpdaterNotificationProps) {
  if (!version) return null;

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-b-lg shadow-lg">
      <span className="text-sm font-medium">Version {version} available</span>
      <button
        onClick={onUpdate}
        className="bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded hover:bg-amber-400 transition-colors"
      >
        Download Update
      </button>
      <button
        onClick={onDismiss}
        className="text-amber-400 hover:text-amber-200 text-xs px-2 py-1 rounded transition-colors"
      >
        Later
      </button>
    </div>
  );
}
