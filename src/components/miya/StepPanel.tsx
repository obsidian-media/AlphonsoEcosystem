import React, { useEffect, useState } from 'react';
import { Badge, Button } from '../ui';
import { isStepStale } from '../../services/contentFactory/contentProjectService';
import { STEP_AGENTS } from '../../services/contentFactory/contentStepRunner';
import type { ContentProject, StepId, StepStatus } from '../../services/contentFactory/contentTypes';

const STEP_LABELS: Record<StepId, string> = {
  brief: 'Brief',
  research: 'Research',
  script: 'Script',
  review: 'Review',
  scenes: 'Scenes',
  thumbnail: 'Thumbnails',
  voice: 'Voice-over',
  music: 'Music',
  broll: 'Stock clips',
  assemble: 'Finished video',
  campaign: 'Campaign',
  quality: 'Quality gate',
};

const STATUS_TEXT: Record<StepStatus, string> = {
  not_started: 'Not started',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  interrupted: 'Stopped when the app closed',
  needs_approval: 'Waiting for your approval',
  approved: 'Approved',
  sent_back: 'Sent back',
};

const STATUS_VARIANT: Record<StepStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  not_started: 'default',
  running: 'info',
  done: 'success',
  failed: 'error',
  interrupted: 'warning',
  needs_approval: 'warning',
  approved: 'success',
  sent_back: 'warning',
};

export interface StepPanelProps {
  project: ContentProject;
  step: StepId;
  onRun(): void;
  onChooseVersion(version: number): void;
  onApprove?(): void;
  onSendBack?(reason: string): void;
  children?: React.ReactNode;
}

function elapsed(fromMs: number | null, now: number): string {
  if (!fromMs) return '';
  const s = Math.max(0, Math.round((now - fromMs) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** One step of a content project: run it, follow it, choose a version, approve it. */
export function StepPanel({ project, step, onRun, onChooseVersion, onApprove, onSendBack, children }: StepPanelProps) {
  const state = project.steps[step];
  const running = state.status === 'running';
  const stale = isStepStale(project, step);
  const [now, setNow] = useState(Date.now());
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const agents = STEP_AGENTS[step].map((a) => a.agent).join(' and ');
  const hasVersion = state.versions.length > 0;
  const failed = state.status === 'failed' || state.status === 'interrupted';

  return (
    <section className="rounded-2xl bg-(--surface-1) p-4 space-y-3" aria-label={STEP_LABELS[step]}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-(--text-1)">{STEP_LABELS[step]}</h3>
          <Badge variant={STATUS_VARIANT[state.status]}>{STATUS_TEXT[state.status]}</Badge>
          {agents && <span className="text-[11px] text-(--text-3)">by {agents}</span>}
        </div>
        <div className="flex items-center gap-2">
          {state.versions.length > 1 && (
            <label className="flex items-center gap-1 text-[11px] text-(--text-3)">
              Version
              <select
                aria-label="Version"
                className="rounded-md bg-(--surface-2) px-1.5 py-0.5 text-[11px] text-(--text-1)"
                value={state.chosenVersion ?? ''}
                onChange={(e) => onChooseVersion(Number(e.target.value))}
              >
                {state.versions.map((v) => <option key={v.version} value={v.version}>{v.version}</option>)}
              </select>
            </label>
          )}
          <Button size="sm" variant={hasVersion ? 'secondary' : 'primary'} onClick={onRun} disabled={running} loading={running}>
            {running ? `Running ${elapsed(state.startedAtMs, now)}` : failed ? 'Retry' : hasVersion ? 'Run again' : 'Run'}
          </Button>
        </div>
      </div>

      {stale && !running && (
        <div className="rounded-xl bg-(--warning-dim) px-3 py-2 text-[12px] text-(--warning)">
          Out of date: an earlier step or the brief changed after this version was made. Run again to update it.
        </div>
      )}

      {state.error && (failed || state.status === 'sent_back' || state.status === 'needs_approval') && (
        <div className={`rounded-xl px-3 py-2 text-[12px] ${failed ? 'bg-(--error-dim) text-(--error)' : 'bg-(--surface-2) text-(--text-2)'}`}>{state.error}</div>
      )}

      {state.progress.length > 0 && (running || failed) && (
        <ol className="space-y-0.5 text-[12px] text-(--text-2)" aria-label="Progress">
          {state.progress.slice(-8).map((p) => <li key={`${p.atMs}-${p.message}`}>{p.message}</li>)}
        </ol>
      )}

      {children}

      {state.status === 'needs_approval' && hasVersion && (onApprove || onSendBack) && (
        <div className="flex flex-wrap items-center gap-2">
          {onApprove && <Button size="sm" onClick={onApprove}>Approve</Button>}
          {onSendBack && <Button size="sm" variant="secondary" onClick={() => setSendingBack(true)}>Send back</Button>}
        </div>
      )}
      {sendingBack && onSendBack && (
        <div className="space-y-2">
          <label className="block text-[11px] text-(--text-3)">
            Why are you sending it back?
            <textarea
              aria-label="Why are you sending it back?"
              className="mt-1 w-full rounded-xl bg-(--surface-2) p-2 text-[12px] text-(--text-1)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button size="sm" variant="secondary" disabled={!reason.trim()} onClick={() => { onSendBack(reason.trim()); setSendingBack(false); setReason(''); }}>
            Send back with this reason
          </Button>
        </div>
      )}
    </section>
  );
}
