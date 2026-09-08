import React, { useEffect, useState } from 'react';
import { getAllStatus } from '../../services/runtimeManagerService';
import {
  checkDiskSpace,
  withTimeout,
  isComponentAlreadyInstalled,
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

const INTENT_RECOMMENDATIONS: Record<IntentId, RecommendedComponent[]> = {
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
  intent: IntentId;
  hardware: HardwareProfile;
  onProceed: (selected: RecommendedComponent[]) => void;
  onCustomize: () => void;
}

export function RecommendedSetup({ intent, hardware, onProceed, onCustomize }: RecommendedSetupProps) {
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [statusUnknown, setStatusUnknown] = useState(false);

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
  const toInstall = recommended.filter((c) => !installedNames.has(c.id));
  const diskCheck = checkDiskSpace(toInstall, hardware.diskFreeGb);
  const needsImageGen = recommended.some((c) => c.id === 'fooocus');

  return (
    <div className="flex flex-col items-center gap-4 p-8 w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">Recommended Setup</h2>
      <div className="flex flex-col gap-2 w-full text-sm">
        {recommended.map((c) => {
          const alreadyInstalled = installedNames.has(c.id);
          return (
            <div key={c.id} className="flex justify-between rounded bg-[var(--surface-2)] px-3 py-2">
              <span className="text-[var(--text-1)]">{c.label}</span>
              <span className="text-[var(--text-3)]">
                {alreadyInstalled ? 'already installed' : `${c.sizeGb}GB`}
              </span>
            </div>
          );
        })}
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
        {diskCheck.unknown && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Couldn&apos;t measure free disk space — install will proceed, but make sure you have
            at least {diskCheck.neededGb}GB free.
          </div>
        )}
        {!diskCheck.ok && (
          <div className="rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-xs">
            Need {diskCheck.shortfallGb}GB more free disk space to install everything above.
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          disabled={!diskCheck.ok}
          onClick={() => diskCheck.ok && onProceed(toInstall)}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface-0)] disabled:opacity-40 disabled:cursor-not-allowed"
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
