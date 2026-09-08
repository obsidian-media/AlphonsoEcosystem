import React, { useEffect, useState } from 'react';
import { scanHardware, withTimeout, type HardwareProfile } from '../../services/setupFlowService';
import { checkPrerequisites, type PrereqStatus } from '../../services/runtimeManagerService';

export interface SystemScanProps {
  onContinue: (profile: HardwareProfile, prereqs: PrereqStatus) => void;
}

export function SystemScan({ onContinue }: SystemScanProps) {
  const [scanning, setScanning] = useState(true);
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [prereqs, setPrereqs] = useState<PrereqStatus | null>(null);
  const [hardwareScanFailed, setHardwareScanFailed] = useState(false);
  const [prereqScanFailed, setPrereqScanFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // allSettled, not all: the two probes are independent, and a failure of
    // one must not discard a good result from the other. (With Promise.all,
    // a prerequisite-scan failure zeroed diskFreeGb, which RecommendedSetup
    // then read as "disk full" and used to block every install.)
    // Each probe is individually timed out inside its own service wrapper,
    // so a host where Tauri's invoke() never settles (a plain browser —
    // `npm run dev`, Playwright) degrades to "unknown" instead of hanging
    // on the scanning screen forever.
    // withTimeout applied at the call site for BOTH probes rather than relying
    // on a wrapper inside one of them — this screen's guarantee is "we always
    // leave the scanning state", and it shouldn't depend on which service
    // happens to bound itself internally.
    Promise.allSettled([withTimeout(scanHardware()), withTimeout(checkPrerequisites())])
      .then(([hwResult, prereqResult]) => {
        if (cancelled) return;
        setProfile(
          hwResult.status === 'fulfilled'
            ? hwResult.value
            // diskFreeGb null (not 0) = "unknown", which does not block installs.
            : { ramGb: 0, diskFreeGb: null, gpuPresent: false, gpuVendor: null, gpuModel: null }
        );
        setPrereqs(
          prereqResult.status === 'fulfilled'
            ? prereqResult.value
            : { missing: [], installHint: 'Could not fully detect prerequisites.' }
        );
        setHardwareScanFailed(hwResult.status === 'rejected');
        setPrereqScanFailed(prereqResult.status === 'rejected');
        setScanning(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (scanning || !profile || !prereqs) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        {/* role="status" so the scanning state, and then its replacement by
            the results below, are both announced — this screen changes
            content without ever moving focus. */}
        <p role="status" className="text-sm text-[var(--text-2)]">Scanning your system…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">System Scan Results</h2>
      <div role="status" className="flex flex-col gap-2 w-full max-w-md text-sm">
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">RAM</span>
          <span className="text-[var(--text-1)]">
            {hardwareScanFailed ? 'Unknown' : `${profile.ramGb}GB RAM`}
          </span>
        </div>
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">Disk</span>
          <span className="text-[var(--text-1)]">
            {profile.diskFreeGb === null ? 'Unknown' : `${profile.diskFreeGb}GB free`}
          </span>
        </div>
        <div className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
          <span className="text-[var(--text-2)]">GPU</span>
          <span className="text-[var(--text-1)]">
            {hardwareScanFailed
              ? 'Unknown'
              : profile.gpuPresent
                ? `${profile.gpuVendor} ${profile.gpuModel}`
                : 'No GPU detected'}
          </span>
        </div>
        {(hardwareScanFailed || prereqScanFailed) && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Some checks couldn&apos;t complete on this system. You can continue — recommendations
            will be more conservative, and anything that turns out to be missing can still be
            installed later from Runtime Hub.
          </div>
        )}
        {!prereqScanFailed && prereqs.dockerFound === false && (
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
