// Resource manager (2026-10-30): Runtime Hub's Memory section. Free and total
// memory, every running tool and loaded model with its memory, who started it,
// how long it has been idle and its idle time, Stop for a tool Alphonso
// started, Unload for an idle model, and the steps waiting for memory.
import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { getIdleMinutes, latestResources, onResources, setIdleMinutes } from '../../services/resources/idleStop';
import { freeThings } from '../../services/resources/freeMemory';
import { GPU_UNKNOWN, readResources, type LoadedThing, type ResourceState } from '../../services/resources/resourceState';
import { usageRecord } from '../../services/resources/toolUse';
import { stopTool } from '../../services/runtimeManagerService';
import { listJoseRequests } from '../../services/jose/joseRequestStore';
import { agentName } from '../../services/jose/agentNames';

export const IDLE_CHOICES: Array<number | null> = [5, 15, 30, 60, null];

const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

function usedLine(totalMb: number, freeMb: number): string {
  return `${gb(Math.max(0, totalMb - freeMb))} of ${gb(totalMb)} used`;
}

function idleLine(thing: LoadedThing, nowMs: number): string {
  if (thing.inUse) return 'In use';
  if (!thing.lastUsedAtMs) return '';
  const minutes = Math.max(0, Math.floor((nowMs - thing.lastUsedAtMs) / 60_000));
  return minutes < 1 ? 'Idle less than a minute' : `Idle ${minutes} min`;
}

function waitingSteps(): string[] {
  const lines: string[] = [];
  for (const request of listJoseRequests()) {
    for (const step of request.steps || []) {
      if (step.waitingFor) lines.push(`${agentName(step.agent)}: ${step.waitingFor}`);
    }
  }
  return lines;
}

export function MemorySection() {
  const [state, setState] = useState<ResourceState | null>(() => latestResources());
  const [busy, setBusy] = useState<string | null>(null);
  const [, setIdleVersion] = useState(0);

  useEffect(() => onResources((next) => setState(next)), []);
  useEffect(() => {
    if (state) return;
    let live = true;
    void readResources(usageRecord()).then((next) => { if (live) setState(next); }, () => undefined);
    return () => { live = false; };
  }, [state]);

  const refresh = async () => {
    try { setState(await readResources(usageRecord())); } catch { /* the next reading shows it */ }
  };

  const act = async (thing: LoadedThing, work: () => Promise<unknown>) => {
    setBusy(thing.name);
    try { await work(); } catch { /* the row stays; the next reading shows what happened */ }
    setBusy(null);
    await refresh();
  };

  const waiting = waitingSteps();
  const now = Date.now();

  return (
    <section id="memory-section" data-testid="memory-section" className="rounded-xl border border-(--border) bg-(--surface-1) p-4 space-y-3">
      <h2 className="text-sm font-semibold text-(--text-1)">Memory</h2>
      {!state || !state.ramTotalMb ? (
        <p className="text-xs text-(--text-3)">Memory on this computer can't be read here.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-(--text-2)">
            <span data-testid="memory-ram">RAM: {usedLine(state.ramTotalMb, state.ramFreeMb)}</span>
            <span data-testid="memory-gpu">
              {state.gpuTotalMb !== null && state.gpuFreeMb !== null
                ? `Graphics memory: ${usedLine(state.gpuTotalMb, state.gpuFreeMb)}`
                : GPU_UNKNOWN}
            </span>
          </div>
          {state.loaded.length === 0 ? (
            <p className="text-xs text-(--text-3)">Nothing is loaded right now.</p>
          ) : (
            <ul className="divide-y divide-(--border)">
              {state.loaded.map((thing) => {
                const idle = thing.kind === 'tool' ? getIdleMinutes(thing.name) : null;
                const idleText = idleLine(thing, now);
                return (
                  <li key={`${thing.kind}:${thing.name}`} data-testid={`memory-row-${thing.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs">
                    <span className="font-medium text-(--text-1) min-w-[8rem]">{thing.label}</span>
                    <span className="text-(--text-2)">{thing.memMb !== null ? gb(thing.memMb) : 'Size not known'}</span>
                    <span className="text-(--text-3)">{thing.startedBy === 'alphonso' ? 'Started by Alphonso' : 'Started by you'}</span>
                    {idleText && <span className="text-(--text-3)">{idleText}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {thing.kind === 'tool' && thing.startedBy === 'alphonso' && thing.name !== 'ollama' && (
                        <label className="flex items-center gap-1 text-(--text-3)">
                          Stop after idle
                          <select
                            data-testid={`memory-idle-${thing.name}`}
                            value={idle === null ? 'never' : String(idle)}
                            onChange={(e) => {
                              setIdleMinutes(thing.name, e.target.value === 'never' ? null : Number(e.target.value));
                              setIdleVersion((v) => v + 1);
                            }}
                            className="rounded-sm border border-(--border) bg-(--surface-2) px-1 py-0.5 text-(--text-1)"
                          >
                            {IDLE_CHOICES.map((m) => (
                              <option key={String(m)} value={m === null ? 'never' : String(m)}>{m === null ? 'Never' : `${m} min`}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {thing.kind === 'tool' && thing.startedBy === 'alphonso' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid={`memory-stop-${thing.name}`}
                          disabled={thing.inUse || busy === thing.name}
                          title={thing.inUse ? 'A step is using it.' : undefined}
                          onClick={() => void act(thing, () => stopTool(thing.name))}
                        >
                          Stop
                        </Button>
                      )}
                      {thing.kind === 'model' && !thing.inUse && (
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid={`memory-unload-${thing.name}`}
                          disabled={busy === thing.name}
                          onClick={() => void act(thing, () => freeThings([thing]))}
                        >
                          Unload
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {waiting.length > 0 && (
        <div data-testid="memory-waiting" className="rounded-lg bg-(--warning-dim) border border-(--warning-border) px-3 py-2 text-xs text-(--text-1) space-y-1">
          {waiting.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </section>
  );
}
