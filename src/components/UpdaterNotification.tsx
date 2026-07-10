import React, { useState, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdaterNotificationProps {
  version: string | null | undefined;
  onDismiss: () => void;
}

export function UpdaterNotification({ version, onDismiss }: UpdaterNotificationProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'installing' | 'relaunching' | 'error'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);

  const handleUpdate = useCallback(async () => {
    setStatus('downloading');
    setProgress(0);
    setError(null);

    try {
      const u = await check();
      if (!u) {
        setError('No update available');
        setStatus('error');
        return;
      }
      setUpdate(u);

      await u.downloadAndInstall((event) => {
        if (event.event === 'Progress' && event.data) {
          setProgress((p) => (p ?? 0) + 10);
        } else if (event.event === 'Finished') {
          setStatus('installing');
        }
      });

      setStatus('relaunching');
      await relaunch();
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  if (!version) return null;

  if (status === 'idle') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-b-lg shadow-lg">
        <span className="text-sm font-medium">Version {version} available</span>
        <button
          onClick={handleUpdate}
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

  if (status === 'downloading') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-b-lg shadow-lg">
        <div className="flex items-center gap-3 w-80">
          <span className="text-sm font-medium flex-1">Downloading v{version}...</span>
          <div className="h-2 w-40 bg-amber-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(100, progress ?? 0)}%` }}
            />
          </div>
          <span className="text-xs font-mono w-10 text-right">{progress ?? 0}%</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-amber-400 hover:text-amber-200 text-xs px-2 py-1 rounded transition-colors"
        >
          Later
        </button>
      </div>
    );
  }

  if (status === 'installing' || status === 'relaunching') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-b-lg shadow-lg">
        <span className="text-sm font-medium">
          {status === 'installing' ? 'Installing update...' : 'Relaunching...'}
        </span>
        <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-2 rounded-b-lg shadow-lg">
        <span className="text-sm font-medium flex-1">Update failed: {error}</span>
        <button
          onClick={() => {
            setStatus('idle');
            setError(null);
          }}
          className="bg-red-500 text-black text-xs font-bold px-3 py-1 rounded hover:bg-red-400 transition-colors"
        >
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-200 text-xs px-2 py-1 rounded transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return null;
}