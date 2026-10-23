import React, { useEffect } from 'react';
import { Button } from '../ui';
import { StepPanel } from './StepPanel';
import { ProjectPicture } from './ProjectPicture';
import { chosenVersionOf } from '../../services/contentFactory/contentProjectService';
import { allowMediaFolder, mediaUrl } from '../../services/contentFactory/contentProjectFiles';
import { openExternalUrl } from '../../services/browserAutomationService';
import type { PictureResult } from '../../services/contentFactory/contentImages';
import type { ContentProject, StepId } from '../../services/contentFactory/contentTypes';

interface ScenesOutput {
  miya?: { style?: string; scenes?: { id: string; startSec?: number; endSec?: number; description: string; camera?: string; movement?: string }[] };
  pictures?: PictureResult[];
}

export interface SceneBuilderTabProps {
  project: ContentProject;
  outputRoot: string;
  runStep(step: StepId): void;
  chooseVersion(step: StepId, version: number): void;
  checkAgain(): void;
}

interface Skipped { skipped?: string }
interface VoiceOut extends Skipped { full?: string; durationSec?: number }
interface MusicOut extends Skipped { path?: string; prompt?: string }
interface Clip { sceneId: string; path: string | null; source?: string; author?: string; pageUrl?: string; license?: string; reason?: string }
interface BrollOut extends Skipped { clips?: Clip[] }
interface VideoOut { aspect: string; path: string; durationSec?: number; frames?: string[] }
interface AssembleOut { outputs?: VideoOut[]; srt?: string; note?: string }

const SOURCE_NAMES: Record<string, string> = { pexels: 'Pexels', pixabay: 'Pixabay', coverr: 'Coverr' };

/** One agent's part of a step's chosen version. */
function agentOutput<T>(project: ContentProject, step: StepId, agent: string): T | undefined {
  return (chosenVersionOf(project, step)?.output as Record<string, T> | undefined)?.[agent];
}

function SkippedNote({ text }: { text?: string }) {
  return text ? <div className="rounded-xl bg-(--surface-2) p-2 text-[12px] text-(--text-2)">{text}</div> : null;
}

/** Storyboard and shot list, with a ComfyUI picture per scene in one shared look,
 *  then the voice-over, music, stock clips and the finished video (phase 2a). */
export function SceneBuilderTab({ project, outputRoot, runStep, chooseVersion, checkAgain }: SceneBuilderTabProps) {
  const output = chosenVersionOf(project, 'scenes')?.output as ScenesOutput | undefined;
  const scenes = output?.miya?.scenes || [];
  const pictures = output?.pictures || [];
  const voice = agentOutput<VoiceOut>(project, 'voice', 'miya');
  const music = agentOutput<MusicOut>(project, 'music', 'miya');
  const broll = agentOutput<BrollOut>(project, 'broll', 'hector');
  const video = agentOutput<AssembleOut>(project, 'assemble', 'alphonso');
  useEffect(() => { if (outputRoot) void allowMediaFolder(outputRoot); }, [outputRoot]);
  const panel = (step: StepId, children: React.ReactNode) => (
    <StepPanel project={project} step={step} onRun={() => runStep(step)} onChooseVersion={(v) => chooseVersion(step, v)}>{children}</StepPanel>
  );
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Scene Builder</h2>
      <StepPanel project={project} step="scenes" onRun={() => runStep('scenes')} onChooseVersion={(v) => chooseVersion('scenes', v)}>
        {output?.miya?.style && <div className="text-[12px] text-(--text-2)">Shared look: {output.miya.style}</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene, index) => {
            const picture = pictures.find((p) => p.sceneId === scene.id);
            return (
              <div key={scene.id} className="space-y-1 rounded-xl bg-(--surface-2) p-2 text-[12px]">
                {picture?.status === 'done' && <ProjectPicture outputRoot={outputRoot} relativePath={picture.relativePath} alt={`Scene ${index + 1}`} className="aspect-video w-full" />}
                {picture?.status === 'pending' && <div className="flex aspect-video items-center justify-center rounded-xl bg-(--surface-1) text-[11px] text-(--text-3)">Waiting for ComfyUI…</div>}
                {picture?.status === 'failed' && <div className="flex aspect-video items-center justify-center rounded-xl bg-(--error-dim) p-2 text-center text-[11px] text-(--error)">{picture.error}</div>}
                <div className="font-semibold text-(--text-1)">Scene {index + 1}</div>
                <div className="text-(--text-2)">{scene.description}</div>
                {(scene.camera || scene.movement) && <div className="text-(--text-3)">Camera: {[scene.camera, scene.movement].filter(Boolean).join(', ')}</div>}
              </div>
            );
          })}
        </div>
        {pictures.some((p) => p.status === 'pending') && <Button size="sm" variant="secondary" onClick={checkAgain}>Check again</Button>}
      </StepPanel>
      {panel('voice', <>
        <SkippedNote text={voice?.skipped} />
        {voice?.full && <audio controls preload="none" src={mediaUrl(outputRoot, voice.full)} className="w-full" />}
        {typeof voice?.durationSec === 'number' && <div className="text-[11px] text-(--text-3)">{voice.durationSec.toFixed(1)} s</div>}
      </>)}
      {panel('music', <>
        <SkippedNote text={music?.skipped} />
        {music?.path && <audio controls preload="none" src={mediaUrl(outputRoot, music.path)} className="w-full" />}
        {music?.prompt && <div className="text-[11px] text-(--text-3)">{music.prompt}</div>}
      </>)}
      {panel('broll', <>
        <SkippedNote text={broll?.skipped} />
        <ul className="space-y-1 text-[12px]">
          {(broll?.clips || []).map((clip) => (
            <li key={clip.sceneId} className="flex flex-wrap items-center gap-2 text-(--text-2)">
              <span className="font-semibold text-(--text-1)">{clip.sceneId}</span>
              {clip.path ? <>
                <span>{`${SOURCE_NAMES[clip.source || ''] || clip.source}: ${clip.author || 'unknown'}`}</span>
                {clip.pageUrl && <Button size="sm" variant="secondary" onClick={() => { void openExternalUrl(clip.pageUrl as string); }}>{clip.license || 'License'}</Button>}
              </> : <span className="text-(--text-3)">{clip.reason || 'No clip; the scene picture is used.'}</span>}
            </li>
          ))}
        </ul>
      </>)}
      {panel('assemble', <>
        <div className="grid gap-3 md:grid-cols-2">
          {(video?.outputs || []).map((out) => (
            <div key={out.path} className="space-y-1 rounded-xl bg-(--surface-2) p-2 text-[12px]">
              <div className="font-semibold text-(--text-1)">{out.aspect.replace('x', ':')}{typeof out.durationSec === 'number' ? `, ${out.durationSec.toFixed(1)} s` : ''}</div>
              <video controls preload="metadata" src={mediaUrl(outputRoot, out.path)} className="max-h-96 w-full rounded-xl bg-black" />
              <div className="grid grid-cols-3 gap-1">
                {(out.frames || []).map((frame, i) => (
                  <ProjectPicture key={frame} outputRoot={outputRoot} relativePath={frame} alt={`Frame ${i + 1} of the ${out.aspect.replace('x', ':')} video`} className="aspect-video w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <SkippedNote text={video?.note} />
      </>)}
    </div>
  );
}
