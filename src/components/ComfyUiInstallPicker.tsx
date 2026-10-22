import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { findComfyuiInstalls, searchComputerForComfyui, type ComfyUiInstall } from '../services/comfyuiSettingsService';

interface Props {
  /** The folder saved in Settings (`settings.comfyuiDir`). */
  comfyuiDir: string;
  /** Save the chosen folder and the Python found for it. */
  onChoose: (dir: string, python: string) => void;
}

const same = (a: string, b: string) =>
  a.trim().replace(/[\\/]+$/, '').toLowerCase() === b.trim().replace(/[\\/]+$/, '').toLowerCase();

function describe(i: ComfyUiInstall) {
  const parts: string[] = [];
  if (i.running) parts.push('running');
  if (i.alphonsoCopy) parts.push("Alphonso's copy");
  parts.push(i.checkpoints === 1 ? '1 image model' : `${i.checkpoints} image models`);
  if (!i.python) parts.push('Python not found');
  return `${i.path} (${parts.join(', ')})`;
}

/**
 * Pick which ComfyUI install Alphonso uses, from the installs found on this
 * machine (QA Bug 31, 2026-10-22). The folder field below stays for a
 * folder the search does not find.
 */
export function ComfyUiInstallPicker({ comfyuiDir, onChoose }: Props) {
  const [installs, setInstalls] = useState<ComfyUiInstall[] | null>(null);
  const [searched, setSearched] = useState<ComfyUiInstall[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');

  const refresh = useCallback(async () => {
    setInstalls(null);
    setInstalls(await findComfyuiInstalls(comfyuiDir));
  }, [comfyuiDir]);

  // A full scan of the drives, only when asked (owner, 2026-10-22): slow, but
  // finds installs that are not running and not in a usual place.
  const searchComputer = async () => {
    setSearching(true);
    setSearchNote('');
    try {
      const result = await searchComputerForComfyui();
      setSearched(result.installs);
      const n = result.installs.length;
      setSearchNote(
        `${n === 0 ? 'No ComfyUI found' : `Found ${n} ComfyUI install${n === 1 ? '' : 's'}`} on this computer.` +
          (result.stoppedEarly ? ' The search stopped after 4 minutes, so some folders were not checked.' : '')
      );
    } catch (e) {
      setSearchNote(`The search failed: ${String((e as Error)?.message || e)}`);
    } finally {
      setSearching(false);
    }
  };

  // Installs found by the quick check plus any the full search added.
  const listed = installs === null ? null : [...installs, ...searched.filter((s) => !installs.some((i) => same(i.path, s.path)))];

  useEffect(() => { void refresh(); }, [refresh]);

  const current = listed?.find((i) => same(i.path, comfyuiDir));

  return (
    <div className="space-y-1.5" data-testid="comfyui-install-picker">
      <div className="flex items-center justify-between">
        <label htmlFor="comfyui-install" className="text-xs font-semibold text-(--text-2)">ComfyUI install</label>
        <button
          onClick={() => void refresh()}
          aria-label="Refresh the ComfyUI install list"
          className="inline-flex items-center gap-1 text-[11px] text-(--text-3) hover:text-(--text-1)"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {listed === null && <div className="text-[11px] text-(--text-4)">Looking for ComfyUI on this computer…</div>}
      {listed !== null && listed.length === 0 && (
        <div className="text-[11px] text-(--text-3)">
          No ComfyUI found yet. Search this computer, install it from Runtime Hub, or enter its folder below.
        </div>
      )}
      {listed !== null && listed.length > 0 && (
        <select
          id="comfyui-install"
          value={current ? current.path : ''}
          onChange={(e) => {
            const chosen = listed.find((i) => i.path === e.target.value);
            if (chosen) onChoose(chosen.path, chosen.python || '');
          }}
          className="w-full bg-(--surface-2) rounded-xl px-3 py-2 text-sm text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
        >
          {!current && <option value="">{comfyuiDir ? `${comfyuiDir} (not found as a ComfyUI install)` : 'Choose an install…'}</option>}
          {listed.map((i) => <option key={i.path} value={i.path}>{describe(i)}</option>)}
        </select>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void searchComputer()}
          disabled={searching}
          className="rounded-md bg-(--surface-3) px-2.5 py-1 text-[11px] text-(--text-1) hover:opacity-90 disabled:opacity-50"
        >
          {searching ? 'Searching this computer…' : 'Search this computer'}
        </button>
        <span className="text-[11px] text-(--text-4)">
          {searching ? 'This can take a few minutes.' : searchNote || 'Finds installs that are not running or not in a usual place. Takes a few minutes.'}
        </span>
      </div>
    </div>
  );
}
