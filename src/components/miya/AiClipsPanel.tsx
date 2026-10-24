import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { StepPanel } from './StepPanel';
import { chosenVersionOf, getVideoSettings, setVideoSettings } from '../../services/contentFactory/contentProjectService';
import { mediaUrl } from '../../services/contentFactory/contentProjectFiles';
import { resolveProjectClipEngine, type ClipOutcome, type ProjectClipEngine } from '../../services/contentFactory/contentMediaExecutor';
import { chosenScenes } from '../../services/contentFactory/clipEngine';
import { estimateRunwayUsd } from '../../services/contentFactory/runwayClip';
import type { ContentProject, VideoSettings } from '../../services/contentFactory/contentTypes';

interface Scene { id: string; startSec?: number; endSec?: number; mainMoment?: boolean }
interface ClipsOutput { engine?: string; model?: string; clips?: ClipOutcome[]; totalUsd?: number; note?: string; skipped?: string }

export interface AiClipsPanelProps {
  project: ContentProject;
  outputRoot: string;
  /** The output folder is allowed for the players (see SceneBuilderTab). */
  mediaReady?: boolean;
  /** The project's run is waiting at the AI clips step (the main moments, and Runway's cost). */
  waiting: boolean;
  onRun(): void;
  onChooseVersion(version: number): void;
  onApprove(): void;
  onCheckAgain(): void;
  onChange(): void;
}

const field = 'rounded-md bg-(--surface-1) px-2 py-1 text-xs text-(--text-1)';

/** Scene Builder → AI clips (Miya content factory phase 2b). */
export function AiClipsPanel({ project, outputRoot, mediaReady = true, waiting, onRun, onChooseVersion, onApprove, onCheckAgain, onChange }: AiClipsPanelProps) {
  const settings = getVideoSettings(project);
  const [engine, setEngine] = useState<ProjectClipEngine | null>(null);

  useEffect(() => {
    let alive = true;
    resolveProjectClipEngine(project).then((e) => { if (alive) setEngine(e); }).catch(() => undefined);
    return () => { alive = false; };
  }, [project.id, settings.aiClips, settings.clipEngine]);

  const save = (patch: Partial<VideoSettings>) => { setVideoSettings(project.id, patch); onChange(); };
  const scenes = ((chosenVersionOf(project, 'scenes')?.output as { miya?: { scenes?: Scene[] } } | undefined)?.miya?.scenes) || [];
  const chosen = chosenScenes(scenes, settings.aiClips);
  const estimate = engine?.engine === 'runway'
    ? estimateRunwayUsd(chosen.map((s) => Math.max(1, (s.endSec ?? 0) - (s.startSec ?? 0))))
    : null;
  const cost = estimate === null ? '' : `about $${estimate.toFixed(2)}`;
  const output = (chosenVersionOf(project, 'clips')?.output as { miya?: ClipsOutput } | undefined)?.miya;

  const engineText = !engine
    ? ''
    : engine.engine === 'local'
      ? `Uses your ComfyUI (${engine.modelId}), up to ${engine.maxSeconds} s a clip.`
      : engine.engine === 'runway'
        ? `Uses Runway (${settings.runwayModel}); each run asks first with the cost.`
        : engine.reason || '';

  return (
    <div className="space-y-2">
      <StepPanel project={project} step="clips" onRun={onRun} onChooseVersion={onChooseVersion}>
        <div className="flex flex-wrap items-center gap-3 text-xs text-(--text-2)">
          <label className="flex items-center gap-1">AI clips for
            <select aria-label="AI clips for" className={field} value={settings.aiClips} onChange={(e) => save({ aiClips: e.target.value as VideoSettings['aiClips'] })}>
              <option value="main">Main moments</option>
              <option value="every">Every scene</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="flex items-center gap-1">Engine
            <select aria-label="Clip engine" className={field} value={settings.clipEngine || ''} onChange={(e) => save({ clipEngine: (e.target.value || null) as VideoSettings['clipEngine'] })}>
              <option value="">Automatic</option>
              <option value="local">Local (ComfyUI)</option>
              <option value="runway">Runway</option>
            </select>
          </label>
          {settings.clipEngine === 'runway' && (
            <label className="flex items-center gap-1">Runway model
              <input aria-label="Runway model" className={`${field} w-28`} value={settings.runwayModel} onChange={(e) => save({ runwayModel: e.target.value })} />
            </label>
          )}
        </div>
        {engineText && <p className="text-[11px] text-(--text-3)">{engineText}</p>}
        {settings.aiClips !== 'none' && engine?.engine && (
          <p className="text-[11px] text-(--text-3)">
            {settings.aiClips === 'main' ? 'Miya marked the main moments; change them on the scenes above.' : 'Every scene gets a clip.'}
            {engine.engine === 'runway' && estimate === null && " Enter Runway's price per second in Settings to see the cost."}
          </p>
        )}
        {settings.aiClips !== 'none' && engine?.engine === 'runway' && estimate !== null && (
          <p className="text-xs font-semibold text-(--text-1)">{`${chosen.length} clip${chosen.length === 1 ? '' : 's'}, ${cost}`}</p>
        )}
        {waiting && (
          <Button size="sm" onClick={onApprove}>{engine?.engine === 'runway' && cost ? `Make AI clips (${cost})` : 'Make AI clips'}</Button>
        )}
        {output?.skipped && <p className="rounded-xl bg-(--surface-2) p-2 text-[12px] text-(--text-2)">{output.skipped}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {(output?.clips || []).map((clip) => (
            <div key={clip.sceneId} className="space-y-1 rounded-xl bg-(--surface-2) p-2 text-[12px]">
              <div className="font-semibold text-(--text-1)">
                {clip.sceneId}{typeof clip.seconds === 'number' ? ` · ${clip.seconds} s` : ''}{typeof clip.costUsd === 'number' ? ` · $${clip.costUsd.toFixed(2)}` : ''}
              </div>
              {mediaReady && clip.status === 'done' && clip.path && <video key={outputRoot} controls preload="metadata" src={mediaUrl(outputRoot, clip.path)} className="max-h-64 w-full rounded-xl bg-black" />}
              {clip.status === 'pending' && <div className="text-(--text-3)">Still being made in ComfyUI.</div>}
              {(clip.status === 'skipped' || clip.status === 'failed') && <div className="text-(--text-3)">{clip.reason}</div>}
            </div>
          ))}
        </div>
        {output?.note && <p className="text-[11px] text-(--text-3)">{output.note}</p>}
        {(output?.clips || []).some((c) => c.status === 'pending') && <Button size="sm" variant="secondary" onClick={onCheckAgain}>Check again</Button>}
      </StepPanel>
    </div>
  );
}
