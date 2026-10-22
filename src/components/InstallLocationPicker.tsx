import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FolderOpen } from 'lucide-react';
import { getInstallLocation, setInstallLocation, type InstallLocation } from '../services/runtimeManagerService';

interface Props {
  /** Called whenever the location is loaded or changed. */
  onChange?: (location: InstallLocation | null) => void;
  /** Highlight the question, e.g. when an install was blocked on it. */
  attention?: boolean;
  /** Load the location but show nothing (Setup loads it early, shows it when a tool is selected). */
  hidden?: boolean;
}

/**
 * Where Runtime Hub installs tools. The user chooses; nothing is hardcoded
 * (owner, 2026-10-22). Until a folder is chosen it asks, suggesting the drive
 * with the most free space.
 */
export function InstallLocationPicker({ onChange, attention = false, hidden = false }: Props) {
  const [location, setLocation] = useState<InstallLocation | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Kept in a ref so a caller passing a new function each render does not
  // reload the location in a loop.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    try {
      const loc = await getInstallLocation();
      setLocation(loc);
      onChangeRef.current?.(loc);
    } catch {
      setLocation(null);
      onChangeRef.current?.(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (path: string) => {
    if (!path) return;
    setSaving(true);
    setError('');
    try {
      const loc = await setInstallLocation(path);
      setLocation(loc);
      onChangeRef.current?.(loc);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const chooseFolder = async () => {
    try {
      const picked = await invoke<{ picked: boolean; path: string }>('pick_folder');
      if (picked?.picked && picked.path) await save(picked.path);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
  };

  if (!location || hidden) return null;

  const free = location.freeGb !== null && location.freeGb !== undefined ? ` · ${location.freeGb} GB free` : '';

  return (
    <div
      data-testid="install-location"
      className={`rounded-xl px-3 py-2 text-xs ${attention && !location.chosen ? 'bg-(--warning-dim) text-(--warning)' : 'bg-(--surface-2) text-(--text-2)'}`}
    >
      {location.chosen ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Tools install to: <span className="font-mono">{location.effective}</span>{free}</span>
          <button
            onClick={() => void chooseFolder()}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-(--surface-3) px-2 py-1 text-[11px] text-(--text-1) hover:opacity-90 disabled:opacity-40"
          >
            <FolderOpen className="h-3 w-3" /> Change…
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="font-semibold">Where should tools be installed?</div>
          <div className="text-(--text-3)">
            They can take several GB each. Suggested: <span className="font-mono">{location.suggested}</span> (the drive with the most free space).
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void save(location.suggested)}
              disabled={saving}
              className="rounded-md bg-(--accent) px-2.5 py-1 text-[11px] font-semibold text-(--accent-contrast) hover:bg-(--accent-hover) disabled:opacity-40"
            >
              Use this folder
            </button>
            <button
              onClick={() => void chooseFolder()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-(--surface-3) px-2.5 py-1 text-[11px] text-(--text-1) hover:opacity-90 disabled:opacity-40"
            >
              <FolderOpen className="h-3 w-3" /> Choose a folder…
            </button>
          </div>
        </div>
      )}
      {error && <div className="mt-1 text-(--error)">{error}</div>}
    </div>
  );
}
