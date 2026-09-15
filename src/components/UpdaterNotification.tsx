import React, { useState, useCallback } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getAllStatus, stopTool } from '../services/runtimeManagerService';

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

      // Real bug found via live testing against v2.7.0: the NSIS installer
      // aborted mid-extraction ("error writing to file ...cublasLt64_12.dll")
      // because Alphonso's own Runtime-Hub-managed Ollama process was still
      // running and holding a lock on its bundled CUDA DLLs -- the installer
      // overwrites those exact files in place. Stop every tool Alphonso
      // itself started (tracked by PID, so this can't touch a process the
      // user runs independently) before the installer ever runs.
      try {
        const statuses = await getAllStatus();
        const running = statuses.filter((s) => s.running);
        await Promise.all(running.map((s) => stopTool(s.name).catch(() => {})));
      } catch { /* best-effort -- do not block the update on this */ }

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
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--warning-dim)] border border-[var(--warning-border)] text-[var(--warning)] px-4 py-2 rounded-b-lg shadow-lg">
        <span className="text-sm font-medium">Version {version} available</span>
        <button
          onClick={handleUpdate}
          className="bg-[var(--warning)] text-black text-xs font-bold px-3 py-1 rounded hover:bg-[var(--warning-dim)] transition-colors"
        >
          Download Update
        </button>
        <button
          onClick={onDismiss}
          className="text-[var(--warning)] hover:text-[var(--warning)] text-xs px-2 py-1 rounded transition-colors"
        >
          Later
        </button>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--warning-dim)] border border-[var(--warning-border)] text-[var(--warning)] px-4 py-2 rounded-b-lg shadow-lg">
        <div className="flex items-center gap-3 w-80">
          <span className="text-sm font-medium flex-1">Downloading v{version}...</span>
          <div className="h-2 w-40 bg-[var(--warning-dim)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--warning)] transition-all duration-300"
              style={{ width: `${Math.min(100, progress ?? 0)}%` }}
            />
          </div>
          <span className="text-xs font-mono w-10 text-right">{progress ?? 0}%</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-[var(--warning)] hover:text-[var(--warning)] text-xs px-2 py-1 rounded transition-colors"
        >
          Later
        </button>
      </div>
    );
  }

  if (status === 'installing' || status === 'relaunching') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--warning-dim)] border border-[var(--warning-border)] text-[var(--warning)] px-4 py-2 rounded-b-lg shadow-lg">
        <span className="text-sm font-medium">
          {status === 'installing' ? 'Installing update...' : 'Relaunching...'}
        </span>
        <div className="w-5 h-5 border-2 border-[var(--warning-border)] border-t-[var(--warning)] rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--error-dim)] border border-[var(--error-border)] text-[var(--error)] px-4 py-2 rounded-b-lg shadow-lg">
        <span className="text-sm font-medium flex-1">Update failed: {error}</span>
        <button
          onClick={() => {
            setStatus('idle');
            setError(null);
          }}
          className="bg-[var(--error)] text-black text-xs font-bold px-3 py-1 rounded hover:bg-[var(--error-dim)] transition-colors"
        >
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="text-[var(--error)] hover:text-[var(--error)] text-xs px-2 py-1 rounded transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return null;
}