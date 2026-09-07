import React, { useEffect, useRef, useState } from 'react';
import { installTool } from '../../services/runtimeManagerService';
import type { SelectableComponent } from '../../services/setupFlowService';

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
}

export function InstallQueue({ components, onStarterReady, onAllComplete }: InstallQueueProps) {
  const [tasks, setTasks] = useState<Task[]>(
    components.map((c) => ({ ...c, status: 'pending' as TaskStatus }))
  );
  const starterReadyFired = useRef(false);
  const allCompleteFired = useRef(false);

  useEffect(() => {
    setTasks((prev) => prev.map((t) => ({ ...t, status: 'installing' })));

    components.forEach((component) => {
      installTool(component.id)
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
    const starter = tasks.find((t) => t.id === 'starter-model');
    if (starter?.status === 'ready' && !starterReadyFired.current) {
      starterReadyFired.current = true;
      onStarterReady();
    }
    const allDone = tasks.every((t) => t.status === 'ready' || t.status === 'error');
    if (allDone && !allCompleteFired.current) {
      allCompleteFired.current = true;
      onAllComplete();
    }
  }, [tasks, onStarterReady, onAllComplete]);

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
