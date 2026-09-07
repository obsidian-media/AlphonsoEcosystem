import React, { useEffect, useState } from 'react';
import { getAllStatus } from '../../services/runtimeManagerService';
import { checkDiskSpace, type SelectableComponent } from '../../services/setupFlowService';
import type { HardwareProfile } from '../../services/setupFlowService';
import type { IntentId } from './IntentSelection';

interface RecommendedComponent extends SelectableComponent {
  label: string;
  warning?: string;
}

// Sizes per the design doc's §6 verified component table. "starter-model"
// maps to whatever DEPENDENCY_BUNDLING_PLAN.md's O2 lands on (llama3.2:3b,
// 2GB, at the time of writing) — see that doc for the authoritative current
// choice if this drifts.
const INTENT_RECOMMENDATIONS: Record<IntentId, RecommendedComponent[]> = {
  'chat-only': [{ id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 }],
  'chat-images': [
    { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
    { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
  ],
  'chat-voice': [
    { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
    { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
  ],
  'full-power': [
    { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
    { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
    { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
    { id: 'chromadb', label: 'ChromaDB (memory)', sizeGb: 1 },
  ],
  custom: [],
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

  useEffect(() => {
    let cancelled = false;
    getAllStatus()
      .then((statuses) => {
        if (cancelled) return;
        const installed = new Set(statuses.filter((s) => s.installed).map((s) => s.name));
        setInstalledNames(installed);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

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
