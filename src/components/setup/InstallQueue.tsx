import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { installComponent, STARTER_MODEL_ID, type SelectableComponent } from '../../services/setupFlowService';
import { COMPONENT_AGENT_COLORS } from './AgentGrid';

type TaskStatus = 'pending' | 'installing' | 'ready' | 'error';

interface Task extends SelectableComponent {
  label: string;
  status: TaskStatus;
  errorMessage?: string;
  // Real progress data normalized by installComponent() -- pct is null
  // whenever the underlying mechanism (ollama pull / Runtime Hub stage)
  // hasn't reported a percentage yet, which is common at the very start
  // of an install (e.g. "starting", "verifying digest").
  message?: string;
  pct: number | null;
}

export interface FailedComponent {
  id: string;
  label: string;
}

export interface InstallQueueProps {
  components: (SelectableComponent & { label: string })[];
  onStarterReady: () => void;
  onAllComplete: () => void;
  /**
   * Called instead of onAllComplete when the queue settles with failures.
   * Carries `id` alongside `label` so the caller can tell whether the
   * starter model itself was among the failures (id-matching against
   * STARTER_MODEL_ID) rather than string-matching a display label, which
   * SetupFlow needs to decide whether "Continue Anyway" is safe to offer.
   */
  onFailed: (failed: FailedComponent[]) => void;
}

export function InstallQueue({ components, onStarterReady, onAllComplete, onFailed }: InstallQueueProps) {
  const [tasks, setTasks] = useState<Task[]>(
    components.map((c) => ({ ...c, status: 'pending' as TaskStatus, pct: null }))
  );
  const starterReadyFired = useRef(false);

  useEffect(() => {
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'installing' })));

    components.forEach((component) => {
      // installComponent, not installTool: the starter model is pulled via
      // ollama, everything else goes through Runtime Hub. Passing a model id
      // to installTool() fails with "Unknown tool".
      installComponent(component.id, (progress) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === component.id ? { ...t, message: progress.message, pct: progress.pct } : t))
        );
      })
        .then(() => {
          setTasks((prev) => prev.map((t) => (t.id === component.id ? { ...t, status: 'ready', pct: 100 } : t)));
          // Mirrors the failure toast below: a background component (not
          // the starter model itself, whose own readiness IS the early-exit
          // trigger) finishing after the user already left needs to say so
          // somewhere, or a successful install is just as invisible as a
          // failed one was. ToastProvider is mounted in main.jsx above
          // App.tsx's SetupFlow/main-shell conditional, so it never unmounts
          // across that swap -- no new cross-component wiring is actually
          // needed here, despite this being flagged as needing exactly that
          // when first deferred (see docs/governance/DEFERRED_WORK.md's
          // 2026-09-08 entry for the full reasoning trail).
          if (starterReadyFired.current && component.id !== STARTER_MODEL_ID) {
            window.dispatchEvent(new CustomEvent('alphonso:toast', {
              detail: {
                type: 'success',
                title: 'Install complete',
                message: `${component.label} is ready.`,
              },
            }));
          }
        })
        .catch((err: unknown) => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === component.id
                ? { ...t, status: 'error', errorMessage: err instanceof Error ? err.message : String(err) }
                : t
            )
          );
          // onStarterReady unmounts this whole screen while other selected
          // components may still be installing in the background -- their
          // promises keep running (unmounting doesn't cancel them) and this
          // catch still fires, but the setTasks call above is now invisible:
          // nothing is reading `tasks` any more. Without this, a background
          // failure after early exit vanished completely -- no error
          // anywhere, no way to know a component the user asked for never
          // actually installed. Reuses the same cross-component
          // `alphonso:toast` mechanism CoachContext already relies on for
          // exactly this "still-mounted parent, unmounted child" case,
          // rather than inventing a second notification path.
          if (starterReadyFired.current) {
            window.dispatchEvent(new CustomEvent('alphonso:toast', {
              detail: {
                type: 'error',
                title: 'Install failed',
                message: `${component.label} couldn't be installed. You can retry it from Runtime Hub.`,
              },
            }));
          }
        });
    });
    // components is expected to be stable for the lifetime of this screen
    // (Setup doesn't let the user change the selection mid-install) — an
    // exhaustive dependency array would re-trigger every install on every
    // render, which is wrong here by design, not an oversight. This
    // codebase's eslint config doesn't flag this pattern (confirmed by
    // eslint reporting the disable directive itself as unused), so no
    // suppression comment is needed.
  }, []);

  useEffect(() => {
    const settled = tasks.every((t) => t.status === 'ready' || t.status === 'error');
    if (!settled) return;
    // Only a fully-successful queue counts as completion. Treating `error`
    // as done would play "Alphonso is online." and persist the setup-complete
    // flag even though a component the user explicitly asked for failed to
    // install — and because the flag gates Setup, they'd never be offered
    // the flow again to retry it. This effect can legitimately re-run after
    // firing once (a later background task settling doesn't change which
    // branch already fired), so neither branch below needs its own
    // fired-once guard beyond onFailed/onAllComplete's own idempotency.
    if (tasks.some((t) => t.status === 'error')) {
      onFailed(tasks.filter((t) => t.status === 'error').map((t) => ({ id: t.id, label: t.label })));
    } else if (!starterReadyFired.current) {
      // A fully successful queue that the user never clicked "Start
      // Chatting Now" for (e.g. the starter model was the last one to
      // finish) still needs to complete the flow.
      onAllComplete();
    }
  }, [tasks, onAllComplete, onFailed]);

  const handleStartChatting = () => {
    if (starterReadyFired.current) return;
    starterReadyFired.current = true;
    onStarterReady();
  };

  const anyInFlight = tasks.some((t) => t.status === 'pending' || t.status === 'installing');
  const starter = tasks.find((t) => t.id === STARTER_MODEL_ID);
  // Design doc §5 step 6 ("Early Exit -> Chat Now"): the instant the starter
  // model reaches Ready, offer a control instead of silently whisking the
  // user into chat -- they may want to watch the rest of the queue finish.
  const showStartChatting = starter?.status === 'ready' && !starterReadyFired.current;

  return (
    <div className="flex flex-col gap-3 p-8 w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">Installing…</h2>
      {/* aria-busy tells assistive tech the list is still changing, so it can
          hold off on summarising a set of rows that are about to move. */}
      <ul role="list" aria-busy={anyInFlight} aria-label="Installation progress" className="contents">
        {tasks.map((task) => {
          const barColor = COMPONENT_AGENT_COLORS[task.id] ?? 'var(--accent)';
          return (
            <li key={task.id} className="rounded bg-[var(--surface-2)] px-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-1)]">{task.label}</span>
                {/* Failures use role="alert" (assertive) because they change
                    what the user has to do next; ordinary progress uses
                    role="status" (polite) so it never interrupts.
                    The visible text stays short, while the sr-only span repeats
                    the component name — a screen reader announcing a live region
                    reads it in isolation, so a bare "Ready" would not say which
                    of several components became ready. */}
                <span
                  role={task.status === 'error' ? 'alert' : 'status'}
                  className="text-[var(--text-3)]"
                >
                  <span className="sr-only">
                    {task.status === 'pending' && `${task.label}: pending`}
                    {task.status === 'installing' && `${task.label}: ${task.message ?? 'downloading'}`}
                    {task.status === 'ready' && `${task.label}: ready`}
                    {task.status === 'error' && `${task.label} failed: ${task.errorMessage}`}
                  </span>
                  <span aria-hidden="true">
                    {task.status === 'pending' && 'Pending'}
                    {task.status === 'installing' && (task.message ?? 'Downloading…')}
                    {task.status === 'ready' && 'Ready'}
                    {task.status === 'error' && `Error: ${task.errorMessage}`}
                  </span>
                </span>
              </div>
              {task.status === 'installing' && (
                <div
                  role="progressbar"
                  aria-label={`${task.label} progress`}
                  aria-valuenow={task.pct ?? undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
                >
                  {task.pct != null ? (
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${task.pct}%`, backgroundColor: barColor }}
                    />
                  ) : (
                    // No percentage yet (e.g. "starting", "verifying digest") --
                    // an indeterminate sweep still shows the row is alive rather
                    // than looking stalled at 0%.
                    <div
                      className="h-full w-1/3 animate-[indeterminate-sweep_1.2s_ease-in-out_infinite] rounded-full"
                      style={{ backgroundColor: barColor }}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {showStartChatting && (
        <motion.button
          type="button"
          onClick={handleStartChatting}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="mt-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--surface-0)]"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Start Chatting Now
        </motion.button>
      )}
    </div>
  );
}
