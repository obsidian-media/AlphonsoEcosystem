import React, { useState } from 'react';
import { Button } from '../ui';
import { StepPanel } from './StepPanel';
import { ProjectPicture } from './ProjectPicture';
import { chosenVersionOf } from '../../services/contentFactory/contentProjectService';
import type { PictureResult } from '../../services/contentFactory/contentImages';
import type { ContentProject, StepId } from '../../services/contentFactory/contentTypes';

interface ThumbnailOutput {
  miya?: { concepts?: { id: string; headline: string; layout: string }[] };
  pictures?: PictureResult[];
}

export interface ThumbnailStudioTabProps {
  project: ContentProject;
  outputRoot: string;
  runStep(step: StepId): void;
  chooseVersion(step: StepId, version: number): void;
  reject(pieceId: string, reason: string): void;
  checkAgain(): void;
}

/** Three finished thumbnails (headline drawn on, brand colours). */
export function ThumbnailStudioTab({ project, outputRoot, runStep, chooseVersion, reject, checkAgain }: ThumbnailStudioTabProps) {
  const output = chosenVersionOf(project, 'thumbnail')?.output as ThumbnailOutput | undefined;
  const concepts = output?.miya?.concepts || [];
  const pictures = output?.pictures || [];
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Thumbnail Studio</h2>
      <StepPanel project={project} step="thumbnail" onRun={() => runStep('thumbnail')} onChooseVersion={(v) => chooseVersion('thumbnail', v)}>
        {concepts.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            {concepts.map((concept) => {
              const picture = pictures.find((p) => p.sceneId === concept.id);
              return (
                <div key={concept.id} className="space-y-2">
                  {picture?.status === 'done' && (
                    <ProjectPicture outputRoot={outputRoot} relativePath={picture.relativePath} alt={`Thumbnail: ${concept.headline}`} className="aspect-video w-full" />
                  )}
                  {picture?.status === 'pending' && (
                    <div className="flex aspect-video items-center justify-center rounded-xl bg-(--surface-2) text-[11px] text-(--text-3)">Waiting for ComfyUI…</div>
                  )}
                  {picture?.status === 'failed' && (
                    <div className="flex aspect-video items-center justify-center rounded-xl bg-(--error-dim) p-2 text-center text-[11px] text-(--error)">{picture.error}</div>
                  )}
                  {!picture && <div className="flex aspect-video items-center justify-center rounded-xl bg-(--surface-2) text-[11px] text-(--text-3)">No picture yet</div>}
                  <div className="text-[12px] font-semibold text-(--text-1)">{concept.headline}</div>
                  <Button size="sm" variant="ghost" onClick={() => { setRejecting(concept.id); setReason(''); }}>Reject</Button>
                  {rejecting === concept.id && (
                    <div className="space-y-1">
                      <label className="block text-[11px] text-(--text-3)">
                        What is wrong with it?
                        <textarea aria-label="What is wrong with it?" className="mt-1 w-full rounded-xl bg-(--surface-2) p-2 text-[12px] text-(--text-1)" value={reason} onChange={(e) => setReason(e.target.value)} />
                      </label>
                      <Button size="sm" variant="secondary" disabled={!reason.trim()} onClick={() => { reject(concept.id, reason.trim()); setRejecting(null); }}>
                        Reject with this reason
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {pictures.some((p) => p.status === 'pending') && <Button size="sm" variant="secondary" onClick={checkAgain}>Check again</Button>}
      </StepPanel>
    </div>
  );
}
