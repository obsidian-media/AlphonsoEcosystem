import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { findComfyuiInstalls, type ComfyUiInstall } from '../services/comfyuiSettingsService';

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

  const refresh = useCallback(async () => {
    setInstalls(null);
    setInstalls(await findComfyuiInstalls(comfyuiDir));
  }, [comfyuiDir]);

  useEffect(() => { void refresh(); }, [refresh]);

  const current = installs?.find((i) => same(i.path, comfyuiDir));

  return (
    <div className="space-y-1.5" data-testid="comfyui-install-picker">
      <div className="flex items-center justify-between">
        <label htmlFor="comfyui-install" className="text-xs font-semibold text-(--text-2)">ComfyUI install</label>
        <button
          onClick={() => void refresh()}
          aria-label="Search again for ComfyUI installs"
          className="inline-flex items-center gap-1 text-[11px] text-(--text-3) hover:text-(--text-1)"
        >
          <RefreshCw className="w-3 h-3" /> Search again
        </button>
      </div>
      {installs === null && <div className="text-[11px] text-(--text-4)">Looking for ComfyUI on this computer…</div>}
      {installs !== null && installs.length === 0 && (
        <div className="text-[11px] text-(--text-3)">
          No ComfyUI found. Install it from Runtime Hub, or enter its folder below.
        </div>
      )}
      {installs !== null && installs.length > 0 && (
        <select
          id="comfyui-install"
          value={current ? current.path : ''}
          onChange={(e) => {
            const chosen = installs.find((i) => i.path === e.target.value);
            if (chosen) onChoose(chosen.path, chosen.python || '');
          }}
          className="w-full bg-(--surface-2) rounded-xl px-3 py-2 text-sm text-(--text-1) focus:outline-hidden focus:ring-1 focus:ring-(--accent-border)"
        >
          {!current && <option value="">{comfyuiDir ? `${comfyuiDir} (not found as a ComfyUI install)` : 'Choose an install…'}</option>}
          {installs.map((i) => <option key={i.path} value={i.path}>{describe(i)}</option>)}
        </select>
      )}
    </div>
  );
}
