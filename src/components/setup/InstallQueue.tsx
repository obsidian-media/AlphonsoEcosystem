import React, { useEffect, useRef, useState } from 'react';
import { installComponent, STARTER_MODEL_ID, type SelectableComponent } from '../../services/setupFlowService';

type TaskStatus = 'pending' | 'installing' | 'ready' | 'error';

interface Task extends SelectableComponent {
  label: string;
  status: TaskStatus;
  errorMessage?: string;
}

export interface InstallQueueProps {
  components: (SelectableComponent & { label: string })[];
  onStarterReady: () => void;
  onAllComplete: () => void;
  /** Called instead of onAllComplete when the queue settles with failures. */
  onFailed: (failedLabels: string[]) => void;
}

export function InstallQueue({ components, onStarterReady, onAllComplete, onFailed }: InstallQueueProps) {
  const [tasks, setTasks] = useState<Task[]>(
    components.map((c) => ({ ...c, status: 'pending' as TaskStatus }))
  );
  const starterReadyFired = useRef(false);
  const allCompleteFired = useRef(false);

  useEffect(() => {
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'installing' })));

    components.forEach((component) => {
      // installComponent, not installTool: the starter model is pulled via
      // ollama, everything else goes through Runtime Hub. Passing a model id
      // to installTool() fails with "Unknown tool".
      installComponent(component.id)
        .then(() => {
          setTasks((prev) => prev.map((t) => (t.id === component.id ? { ...t, status: 'ready' } : t)));
        })
        .catch((err: unknown) => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === component.id
                ? { ...t, status: 'error', errorMessage: err instanceof Error ? err.message : String(err) }
                : t
            )
          );
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
    const starter = tasks.find((t) => t.id === STARTER_MODEL_ID);
    if (starter?.status === 'ready' && !starterReadyFired.current) {
      starterReadyFired.current = true;
      onStarterReady();
    }
    const settled = tasks.every((t) => t.status === 'ready' || t.status === 'error');
    if (!settled || allCompleteFired.current) return;
    allCompleteFired.current = true;
    // Only a fully-successful queue counts as completion. Treating `error`
    // as done would play "Alphonso is online." and persist the setup-complete
    // flag even though a component the user explicitly asked for failed to
    // install — and because the flag gates Setup, they'd never be offered
    // the flow again to retry it.
    if (tasks.some((t) => t.status === 'error')) {
      onFailed(tasks.filter((t) => t.status === 'error').map((t) => t.label));
    } else {
      onAllComplete();
    }
  }, [tasks, onStarterReady, onAllComplete, onFailed]);

  return (
    <div className="flex flex-col gap-3 p-8 w-full max-w-lg">
      <h2 className="text-2xl font-semibold text-[var(--text-1)]">Installing…</h2>
      {tasks.map((task) => (
        <div key={task.id} className="rounded bg-[var(--surface-2)] px-3 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-1)]">{task.label}</span>
            <span className="text-[var(--text-3)]">
              {task.status === 'pending' && 'Pending'}
              {task.status === 'installing' && 'Downloading…'}
              {task.status === 'ready' && 'Ready'}
              {task.status === 'error' && `Error: ${task.errorMessage}`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
