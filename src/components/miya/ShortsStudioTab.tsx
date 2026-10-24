import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { StepPanel } from './StepPanel';
import { allowMediaFolder, mediaUrl } from '../../services/contentFactory/contentProjectFiles';
import {
  chosenVersionOf, getShortsSettings, setShortKind, setShortPlatforms, setShortsSettings,
} from '../../services/contentFactory/contentProjectService';
import { fitsPlatform, formatSeconds } from '../../services/contentFactory/platformLimits';
import type { ShortOutput } from '../../services/contentFactory/shortMaker';
import type { ContentProject, PostPlatform, ShortKind, ShortPlan, StepId } from '../../services/contentFactory/contentTypes';

const PLATFORMS: { id: PostPlatform; name: string }[] = [
  { id: 'youtube', name: 'YouTube' }, { id: 'instagram', name: 'Instagram' }, { id: 'facebook', name: 'Facebook' },
];
const KINDS: { id: ShortKind; label: string }[] = [
  { id: 'mini', label: 'Its own mini-script' },
  { id: 'highlight', label: 'A highlight with its own hook' },
  { id: 'cut', label: 'A plain cut of the video' },
];

export interface ShortsStudioTabProps {
  project: ContentProject;
  outputRoot: string;
  runStep(step: StepId): void;
  chooseVersion(step: StepId, version: number): void;
  redo(shortId: string): void;
  reject(pieceId: string, reason: string): void;
  addShort(): void;
  onChange(): void;
}

/** What a platform makes of a Short of this length. */
function fitText(platform: PostPlatform, seconds: number | undefined): string {
  const name = PLATFORMS.find((p) => p.id === platform)?.name || platform;
  const fit = fitsPlatform(platform, platform === 'youtube' ? 'short' : 'reel', seconds ?? null);
  if (!fit.ok) return `${name}: ${fit.reason}`;
  if (fit.asRegularVideo) return `${name}: a regular video (over 3 minutes)`;
  return `${name}: fits`;
}

/** Shorts Studio (content factory phase 3d): every Short as its own piece. */
export function ShortsStudioTab({ project, outputRoot, runStep, chooseVersion, redo, reject, addShort, onChange }: ShortsStudioTabProps) {
  const output = chosenVersionOf(project, 'shorts')?.output as { miya?: { shorts?: ShortPlan[] }; made?: Record<string, ShortOutput> } | undefined;
  const shorts = output?.miya?.shorts || [];
  const made = output?.made || {};
  const clipSetting = getShortsSettings(project);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // The players wait until the output folder may be played from (as in the Scene Builder).
  const [allowedRoot, setAllowedRoot] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (outputRoot) void allowMediaFolder(outputRoot).then((ok) => { if (alive && ok) setAllowedRoot(outputRoot); });
    return () => { alive = false; };
  }, [outputRoot]);
  const mediaReady = !!outputRoot && allowedRoot === outputRoot;
  const field = 'rounded-lg bg-(--surface-2) px-2 py-1 text-[12px] text-(--text-1)';

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Shorts Studio</h2>
      <StepPanel project={project} step="shorts" onRun={() => runStep('shorts')} onChooseVersion={(v) => chooseVersion('shorts', v)}>
        <label className="block text-[11px] text-(--text-3)">
          AI clips for Shorts
          <select aria-label="AI clips for Shorts" className={`${field} ml-2`} value={clipSetting.aiClips}
            onChange={(e) => { setShortsSettings(project.id, { aiClips: e.target.value as 'main' | 'every' | 'none', clipEngine: e.target.value === 'none' ? null : 'local' }); onChange(); }}>
            <option value="none">None (pictures only, fast and free)</option>
            <option value="main">The hook and the ending</option>
            <option value="every">Every part</option>
          </select>
        </label>
        {shorts.length === 0 && (
          <p className="text-[12px] text-(--text-3)">
            No Shorts yet. To make them with the project, add "Shorts" to What to make in the brief ("3 Shorts" for three); or run this step now.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {shorts.map((short, index) => {
            const n = index + 1;
            const result = made[short.id];
            const seconds = result?.seconds ?? short.seconds;
            return (
              <div key={short.id} className="space-y-2 rounded-xl bg-(--surface-2) p-3" data-testid={`short-${short.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-(--text-1)">{short.title || `Short ${n}`}</span>
                  <span className="text-[11px] text-(--text-3)">{formatSeconds(seconds)}</span>
                </div>
                <div className="text-[12px] text-(--text-2)">{short.hook}</div>
                <label className="block text-[11px] text-(--text-3)">
                  Kind
                  <select aria-label={`Kind of Short ${n}`} className={`${field} ml-2`} value={short.kind}
                    onChange={(e) => { setShortKind(project.id, short.id, e.target.value as ShortKind); onChange(); }}>
                    {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </label>
                {short.kind !== 'mini' && short.moment && (
                  <div className="text-[11px] text-(--text-3)">From the finished video: {formatSeconds(short.moment.startSec)}–{formatSeconds(short.moment.endSec)}</div>
                )}
                <div className="flex flex-wrap gap-3 text-[11px] text-(--text-2)">
                  {PLATFORMS.map((p) => (
                    <label key={p.id} className="flex items-center gap-1">
                      <input type="checkbox" aria-label={`Short ${n} on ${p.name}`} checked={short.platforms.includes(p.id)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...short.platforms, p.id] : short.platforms.filter((x) => x !== p.id);
                          setShortPlatforms(project.id, short.id, next);
                          onChange();
                        }} />
                      {p.name}
                    </label>
                  ))}
                </div>
                {short.platforms.length === 0
                  ? <p className="text-[11px] text-(--warning)">This Short won't be posted: tick a platform for it.</p>
                  : <ul className="text-[11px] text-(--text-3)">{short.platforms.map((p) => <li key={p}>{fitText(p, seconds)}</li>)}</ul>}
                {result?.status === 'done' && result.path && mediaReady && (
                  <video key={outputRoot} controls preload="metadata" src={mediaUrl(outputRoot, result.path)} className="max-h-96 w-full rounded-xl bg-black" />
                )}
                {result?.status === 'failed' && <p className="text-[11px] text-(--error)">{result.reason}</p>}
                {!result && <p className="text-[11px] text-(--text-3)">Not made yet.</p>}
                {result?.note && <p className="text-[11px] text-(--text-3)">{result.note}</p>}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Redo Short ${n}`} onClick={() => redo(short.id)}>Redo</Button>
                  <Button size="sm" variant="ghost" aria-label={`Send back Short ${n}`} onClick={() => { setRejecting(short.id); setReason(''); }}>Send back</Button>
                </div>
                {rejecting === short.id && (
                  <div className="space-y-1">
                    <label className="block text-[11px] text-(--text-3)">
                      What is wrong with it?
                      <textarea aria-label="What is wrong with it?" className="mt-1 w-full rounded-xl bg-(--surface-1) p-2 text-[12px] text-(--text-1)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </label>
                    <Button size="sm" variant="secondary" disabled={!reason.trim()} onClick={() => { reject(short.id, reason.trim()); setRejecting(null); }}>Send back with this reason</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Button size="sm" variant="secondary" onClick={addShort}>Add a Short</Button>
      </StepPanel>
    </div>
  );
}
