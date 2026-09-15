import React, { useEffect, useState } from 'react';
import { getAllStatus, installPrerequisite } from '../../services/runtimeManagerService';
import type { PrereqStatus } from '../../services/runtimeManagerService';
import {
  checkDiskSpace,
  withTimeout,
  isComponentAlreadyInstalled,
  getUnmetPrereq,
  STARTER_MODEL_ID,
  STARTER_MODEL_TAG,
  type SelectableComponent,
} from '../../services/setupFlowService';
import type { HardwareProfile } from '../../services/setupFlowService';
import type { IntentId } from './IntentSelection';

interface RecommendedComponent extends SelectableComponent {
  label: string;
  warning?: string;
}

// RecommendedSetup has nothing to recommend for 'custom' — there's no intent
// to combine with the hardware scan — so SetupFlow routes 'custom' straight
// to AgentGrid instead and never renders this component for it. Excluding it
// from this type (rather than adding a dead map entry) means the compiler
// itself enforces that this component can never be asked to handle it.
type RecommendableIntent = Exclude<IntentId, 'custom'>;

// Sizes per the design doc's §6 verified component table. The starter model's
// id and ollama tag live in setupFlowService (STARTER_MODEL_ID/TAG) so the
// queued id, the pulled tag, and the already-installed check can't drift
// apart; see DEPENDENCY_BUNDLING_PLAN.md's O2 for the authoritative model
// choice if it changes.
const STARTER_MODEL_ENTRY: RecommendedComponent = {
  id: STARTER_MODEL_ID,
  label: `Ollama + starter model (${STARTER_MODEL_TAG})`,
  sizeGb: 2,
};

const INTENT_RECOMMENDATIONS: Record<RecommendableIntent, RecommendedComponent[]> = {
  'chat-only': [STARTER_MODEL_ENTRY],
  'chat-images': [
    STARTER_MODEL_ENTRY,
    { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
  ],
  'chat-voice': [
    STARTER_MODEL_ENTRY,
    { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
  ],
  'full-power': [
    STARTER_MODEL_ENTRY,
    { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
    { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
    { id: 'chromadb', label: 'ChromaDB (memory)', sizeGb: 1 },
  ],
};

export interface RecommendedSetupProps {
  intent: RecommendableIntent;
  hardware: HardwareProfile;
  prereqs: PrereqStatus;
  onProceed: (selected: RecommendedComponent[]) => void;
  onCustomize: () => void;
}

export function RecommendedSetup({ intent, hardware, prereqs: initialPrereqs, onProceed, onCustomize }: RecommendedSetupProps) {
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [statusUnknown, setStatusUnknown] = useState(false);
  // Local, mutable copy: installing Python mid-screen needs to unblock the
  // components that depend on it without a full re-scan round-trip.
  const [prereqs, setPrereqs] = useState<PrereqStatus>(initialPrereqs);
  const [installingPython, setInstallingPython] = useState(false);
  const [pythonInstallError, setPythonInstallError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const recommendedIds = INTENT_RECOMMENDATIONS[intent].map((c) => c.id);

    withTimeout(getAllStatus())
      .then(async (statuses) => {
        const toolNames = new Set(statuses.filter((s) => s.installed).map((s) => s.name));
        // Ask each component the right question for its kind — Runtime Hub's
        // status list can't answer for the starter model, which lives in
        // ollama's own store (see isComponentAlreadyInstalled).
        const checks = await Promise.all(
          recommendedIds.map(async (id) => [id, await isComponentAlreadyInstalled(id, toolNames)] as const)
        );
        if (cancelled) return;
        setInstalledNames(new Set(checks.filter(([, present]) => present).map(([id]) => id)));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Distinguish "nothing is installed" from "we couldn't check".
        // Silently treating a failed status lookup as an empty set would
        // re-queue components the user already has — wasting a multi-GB
        // download — so surface it instead of guessing.
        setStatusUnknown(true);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [intent]);

  if (!loaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-[var(--text-2)]">Loading recommendations…</p>
      </div>
    );
  }

  const recommended = INTENT_RECOMMENDATIONS[intent];
  const notInstalled = recommended.filter((c) => !installedNames.has(c.id));
  // Split out anything whose real prerequisite isn't met — queuing it anyway
  // would fail exactly like the starter-model bug did, just for a different
  // reason. These never enter the queue at all, matching how a Docker-missing
  // component was already handled; Python-missing gets an inline fix instead
  // of a dead end, since Python (unlike Docker) has a real auto-install path.
  const toInstall = notInstalled.filter((c) => getUnmetPrereq(c.id, prereqs) === null);
  const diskCheck = checkDiskSpace(toInstall, hardware.diskFreeGb, hardware.ollamaModelsDirFreeGb);
  const needsImageGen = recommended.some((c) => c.id === 'fooocus');

  const handleInstallPython = async () => {
    setInstallingPython(true);
    setPythonInstallError(null);
    try {
      await installPrerequisite('python');
      // Update locally rather than re-running the whole hardware/prereq scan
      // — the user is mid-decision on this screen, not starting over.
      setPrereqs((prev) => ({ ...prev, pythonFound: true }));
    } catch (err) {
      setPythonInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingPython(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-8 w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">Recommended Setup</h2>
      <div className="flex flex-col gap-2 w-full text-sm">
        {recommended.map((c) => {
          const alreadyInstalled = installedNames.has(c.id);
          const unmetPrereq = alreadyInstalled ? null : getUnmetPrereq(c.id, prereqs);
          return (
            <div key={c.id} className="flex flex-col gap-1 rounded bg-[var(--surface-2)] px-3 py-2">
              <div className="flex justify-between">
                <span className="text-[var(--text-1)]">{c.label}</span>
                <span className="text-[var(--text-3)]">
                  {alreadyInstalled ? 'already installed' : unmetPrereq ? 'skipped' : `${c.sizeGb}GB`}
                </span>
              </div>
              {unmetPrereq === 'python' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--warning)]">
                    Needs Python, which isn&apos;t installed.
                  </span>
                  <button
                    onClick={handleInstallPython}
                    disabled={installingPython}
                    className="shrink-0 rounded border border-[var(--warning)] px-2 py-1 text-xs text-[var(--warning)] disabled:opacity-50"
                  >
                    {installingPython ? 'Installing…' : 'Install Python'}
                  </button>
                </div>
              )}
              {unmetPrereq === 'docker' && (
                <span className="text-xs text-[var(--warning)]">
                  Needs Docker, which isn&apos;t installed. Docker can&apos;t be installed
                  automatically — see Runtime Hub after Setup for manual install steps, then add
                  this component from there.
                </span>
              )}
            </div>
          );
        })}
        {pythonInstallError && (
          <div className="rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-xs">
            Couldn&apos;t install Python: {pythonInstallError}
          </div>
        )}
        {needsImageGen && !hardware.gpuPresent && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            No GPU detected — image generation will be slow (CPU-only).
          </div>
        )}
        {statusUnknown && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Couldn&apos;t check what&apos;s already installed — anything you already have may be
            reinstalled. Runtime Hub shows the real state once you&apos;re in the app.
          </div>
        )}
        {diskCheck.unknown && diskCheck.starterModelShortfallGb === undefined && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Couldn&apos;t measure free disk space — install will proceed, but make sure you have
            at least {diskCheck.requiredGb}GB free.
          </div>
        )}
        {diskCheck.shortfallGb > 0 && (
          <div className="rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-xs">
            Need {diskCheck.shortfallGb}GB more free disk space to install everything above.
          </div>
        )}
        {diskCheck.starterModelShortfallGb !== undefined && (
          <div className="rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-xs">
            Your configured Ollama models directory (OLLAMA_MODELS) is {diskCheck.starterModelShortfallGb}GB
            short for the starter model.
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          disabled={!diskCheck.ok}
          onClick={() => diskCheck.ok && onProceed(toInstall)}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Looks Good → Install
        </button>
        <button
          onClick={onCustomize}
          className="rounded border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-2)]"
        >
          Customize
        </button>
      </div>
    </div>
  );
}
