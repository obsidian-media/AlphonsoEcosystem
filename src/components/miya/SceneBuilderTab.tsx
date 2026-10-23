import React from 'react';
import { Button } from '../ui';
import { StepPanel } from './StepPanel';
import { ProjectPicture } from './ProjectPicture';
import { chosenVersionOf } from '../../services/contentFactory/contentProjectService';
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

/** Storyboard and shot list, with a ComfyUI picture per scene in one shared look. */
export function SceneBuilderTab({ project, outputRoot, runStep, chooseVersion, checkAgain }: SceneBuilderTabProps) {
  const output = chosenVersionOf(project, 'scenes')?.output as ScenesOutput | undefined;
  const scenes = output?.miya?.scenes || [];
  const pictures = output?.pictures || [];
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
    </div>
  );
}
