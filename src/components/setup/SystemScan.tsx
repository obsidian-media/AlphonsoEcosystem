import React, { useEffect, useState } from 'react';
import { scanHardware, type HardwareProfile } from '../../services/setupFlowService';
import { checkPrerequisites, type PrereqStatus } from '../../services/runtimeManagerService';

export interface SystemScanProps {
  onContinue: (profile: HardwareProfile, prereqs: PrereqStatus) => void;
}

export function SystemScan({ onContinue }: SystemScanProps) {
  const [scanning, setScanning] = useState(true);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [prereqs, setPrereqs] = useState<PrereqStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([scanHardware(), checkPrerequisites()])
      .then(([hw, prereq]) => {
        if (cancelled) return;
        setProfile(hw);
        setPrereqs(prereq);
        setScanning(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Scan failure degrades to "continue with unknowns" rather than
        // blocking Setup entirely — see the design doc's §9 scan-timeout
        // open item. A full retry/timeout UX is deferred; this is the
        // minimum viable non-blocking fallback.
        setProfile({ ramGb: 0, diskFreeGb: 0, gpuPresent: false, gpuVendor: null, gpuModel: null });
        setPrereqs({ missing: [], installHint: 'Could not fully detect prerequisites.' });
        setScanning(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (scanning || !profile || !prereqs) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-[var(--text-2)]">Scanning your system…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">System Scan Results</h2>
      <div className="flex flex-col gap-2 w-full max-w-md text-sm">
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">RAM</span>
          <span className="text-[var(--text-1)]">{profile.ramGb}GB RAM</span>
        </div>
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">Disk</span>
          <span className="text-[var(--text-1)]">{profile.diskFreeGb}GB free</span>
        </div>
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">GPU</span>
          <span className="text-[var(--text-1)]">
            {profile.gpuPresent ? `${profile.gpuVendor} ${profile.gpuModel}` : 'No GPU detected'}
          </span>
        </div>
        {prereqs.dockerFound === false && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Docker not found — needed only if you choose n8n, ChromaDB, or OpenHands later. Not auto-installable; see Runtime Hub for manual setup instructions.
          </div>
        )}
      </div>
      <button
        onClick={() => onContinue(profile, prereqs)}
        className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface-0)]"
      >
        Continue
      </button>
    </div>
  );
}
