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

interface AgentEntry {
  agentId: string;
  name: string;
  color: string;
  // Real component this agent's optional capability installs — undefined
  // means the agent is software-only (local-Ollama-powered or cloud-only,
  // per CLAUDE.md), with nothing to install at all.
  component?: { id: string; label: string; sizeGb: number };
  // Alphonso's component (the starter model) isn't optional — chat needs it.
  alwaysOn?: boolean;
}

// The real 9 agents, confirmed against src/agents/*/*.js — NOT the original
// draft's 8-tile roster, which included "Boardroom" (a feature, not an
// agent) and omitted Sentinel and Nova entirely. Colors match the palette
// already established for per-agent tiles elsewhere in this design (Miya
// pink, Marcus red, Maria teal, etc.).
const AGENTS: AgentEntry[] = [
  {
    agentId: 'alphonso',
    name: 'Alphonso',
    color: 'var(--accent)',
    alwaysOn: true,
    component: { id: STARTER_MODEL_ID, label: `Starter model (${STARTER_MODEL_TAG})`, sizeGb: 2 },
  },
  { agentId: 'jose', name: 'Jose', color: '#9D4EDD' },
  {
    agentId: 'miya',
    name: 'Miya',
    color: '#FF2D95',
    component: { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
  },
  { agentId: 'hector', name: 'Hector', color: '#FF9800' },
  {
    agentId: 'maria',
    name: 'Maria',
    color: '#00ACC1',
    component: { id: 'chromadb', label: 'ChromaDB (memory)', sizeGb: 1 },
  },
  {
    agentId: 'marcus',
    name: 'Marcus',
    color: '#FF1744',
    component: { id: 'voice-os', label: 'Voice OS', sizeGb: 1 },
  },
  { agentId: 'echo', name: 'Echo', color: '#5E35B1' },
  { agentId: 'sentinel', name: 'Sentinel', color: '#616161' },
  { agentId: 'nova', name: 'Nova', color: '#76FF03' },
];

export interface AgentGridProps {
  hardware: HardwareProfile;
  prereqs: PrereqStatus;
  onProceed: (selected: SelectableComponent[]) => void;
  onBack: () => void;
}

export function AgentGrid({ hardware, prereqs: initialPrereqs, onProceed, onBack }: AgentGridProps) {
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [prereqs, setPrereqs] = useState<PrereqStatus>(initialPrereqs);
  const [installingPython, setInstallingPython] = useState(false);

  const optionalComponentIds = AGENTS.filter((a) => a.component && !a.alwaysOn).map((a) => a.component!.id);

  useEffect(() => {
    let cancelled = false;
    withTimeout(getAllStatus())
      .then(async (statuses) => {
        const toolNames = new Set(statuses.filter((s) => s.installed).map((s) => s.name));
        const checks = await Promise.all(
          [STARTER_MODEL_ID, ...optionalComponentIds].map(
            async (id) => [id, await isComponentAlreadyInstalled(id, toolNames)] as const
          )
        );
        if (cancelled) return;
        setInstalledNames(new Set(checks.filter(([, present]) => present).map(([id]) => id)));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => { cancelled = true; };
    // optionalComponentIds is derived from the static AGENTS list — stable
    // across renders, so it is intentionally excluded from the dependency
    // array rather than recomputed and re-triggering the scan every render.
    // (This repo's eslint config doesn't flag missing deps here — confirmed
    // by the disable directive itself being reported as unused.)
  }, []);

  const toggle = (componentId: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(componentId)) next.delete(componentId);
      else next.add(componentId);
      return next;
    });
  };

  const handleInstallPython = async () => {
    setInstallingPython(true);
    try {
      await installPrerequisite('python');
      setPrereqs((prev) => ({ ...prev, pythonFound: true }));
    } finally {
      setInstallingPython(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-[var(--text-2)]">Loading…</p>
      </div>
    );
  }

  const selectedComponents = AGENTS.filter(
    (a) => a.component && (a.alwaysOn || toggled.has(a.component.id))
  ).map((a) => a.component!);
  const notInstalled = selectedComponents.filter((c) => !installedNames.has(c.id));
  const toInstall = notInstalled.filter((c) => getUnmetPrereq(c.id, prereqs) === null);
  const diskCheck = checkDiskSpace(toInstall, hardware.diskFreeGb);

  return (
    <div className="flex flex-col items-center gap-4 p-8 w-full max-w-3xl">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[var(--text-1)]">Choose Your Agents</h2>
        <p className="text-sm text-[var(--text-3)] mt-1">
          Alphonso is always included. Toggle the others on for their extra capability.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {AGENTS.map((agent) => {
          const isChecked = agent.alwaysOn || (agent.component ? toggled.has(agent.component.id) : false);
          const alreadyInstalled = agent.component ? installedNames.has(agent.component.id) : false;
          const unmetPrereq =
            agent.component && isChecked && !alreadyInstalled
              ? getUnmetPrereq(agent.component.id, prereqs)
              : null;

          return (
            <div
              key={agent.agentId}
              style={{ borderColor: agent.color }}
              className="flex flex-col gap-1 rounded-lg border p-3 bg-[var(--surface-2)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: agent.color }}>{agent.name}</span>
                {agent.component ? (
                  <input
                    type="checkbox"
                    aria-label={agent.name}
                    checked={isChecked}
                    disabled={agent.alwaysOn}
                    onChange={() => agent.component && toggle(agent.component.id)}
                  />
                ) : null}
              </div>
              <span className="text-xs text-[var(--text-3)]">
                {!agent.component
                  ? 'Included — no extra install needed'
                  : alreadyInstalled
                    ? 'Already installed'
                    : agent.alwaysOn
                      ? `${agent.component.sizeGb}GB — required for chat`
                      : isChecked
                        ? `${agent.component.sizeGb}GB`
                        : 'Optional'}
              </span>
              {unmetPrereq === 'python' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--warning)]">Needs Python.</span>
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
                  Needs Docker — not auto-installable, see Runtime Hub after Setup.
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 w-full max-w-md text-sm">
        {diskCheck.unknown && (
          <div className="rounded bg-[var(--warning-dim)] px-3 py-2 text-[var(--warning)] text-xs">
            Couldn&apos;t measure free disk space — install will proceed, but make sure you have
            at least {diskCheck.neededGb}GB free.
          </div>
        )}
        {!diskCheck.ok && (
          <div className="rounded bg-[var(--error-dim)] px-3 py-2 text-[var(--error)] text-xs">
            Need {diskCheck.shortfallGb}GB more free disk space for your current selection.
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="rounded border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text-2)]"
        >
          Back
        </button>
        <button
          disabled={!diskCheck.ok}
          onClick={() => diskCheck.ok && onProceed(toInstall)}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--surface-0)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Install Selected
        </button>
      </div>
    </div>
  );
}
