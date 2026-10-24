import React, { useState } from 'react';
import { Button } from '../ui';
import { StepPanel } from './StepPanel';
import { ProjectPicture } from './ProjectPicture';
import { chosenVersionOf } from '../../services/contentFactory/contentProjectService';
import type { PictureResult } from '../../services/contentFactory/contentImages';
import type { CarouselSlide, ContentProject, StepId } from '../../services/contentFactory/contentTypes';

interface CarouselOutput {
  miya?: { slides?: CarouselSlide[] };
  pictures?: PictureResult[];
}

export interface CarouselStudioTabProps {
  project: ContentProject;
  outputRoot: string;
  runStep(step: StepId): void;
  chooseVersion(step: StepId, version: number): void;
  /** Makes one slide's picture again (its position). */
  redo(index: number): void;
  move(from: number, to: number): void;
  reject(pieceId: string, reason: string): void;
  checkAgain(): void;
}

/** Carousel Studio (content factory phase 3c): every slide, redo one, reorder, send one back. */
export function CarouselStudioTab({ project, outputRoot, runStep, chooseVersion, redo, move, reject, checkAgain }: CarouselStudioTabProps) {
  const output = chosenVersionOf(project, 'carousel')?.output as CarouselOutput | undefined;
  const slides = output?.miya?.slides || [];
  const pictures = output?.pictures || [];
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const tall = 'aspect-[4/5]';

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-lg font-bold text-(--text-1)">Carousel Studio</h2>
      <StepPanel project={project} step="carousel" onRun={() => runStep('carousel')} onChooseVersion={(v) => chooseVersion('carousel', v)}>
        {slides.length === 0 && (
          <p className="text-[12px] text-(--text-3)">
            No carousel yet. To make one with the project, add “carousel” to What to make in the brief; or run this step now.
            Miya writes 5 to 10 slides from the research and the script.
          </p>
        )}
        {slides.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {slides.map((slide, index) => {
              const n = index + 1;
              const picture = pictures.find((p) => p.sceneId === slide.id);
              return (
                <div key={slide.id} className="space-y-1.5" data-testid={`carousel-slide-${slide.id}`}>
                  {picture?.status === 'done' && (
                    <ProjectPicture outputRoot={outputRoot} relativePath={picture.relativePath} alt={`Slide ${n}: ${slide.headline}`} className={`${tall} w-full`} />
                  )}
                  {picture?.status === 'pending' && (
                    <div className={`flex ${tall} items-center justify-center rounded-xl bg-(--surface-2) text-[11px] text-(--text-3)`}>{picture.requestId ? 'Waiting for Higgsfield…' : 'Waiting for ComfyUI…'}</div>
                  )}
                  {picture?.status === 'failed' && (
                    <div className={`flex ${tall} items-center justify-center rounded-xl bg-(--error-dim) p-2 text-center text-[11px] text-(--error)`}>{picture.error}</div>
                  )}
                  {!picture && <div className={`flex ${tall} items-center justify-center rounded-xl bg-(--surface-2) text-[11px] text-(--text-3)`}>No picture yet</div>}
                  <div className="text-[10px] uppercase tracking-widest text-(--text-3)">{index === 0 ? 'Cover' : `Slide ${n}`}</div>
                  <div className="text-[12px] font-semibold text-(--text-1)">{slide.headline}</div>
                  <div className="text-[11px] text-(--text-2)">{slide.body}</div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Move slide ${n} left`} disabled={index === 0} onClick={() => move(index, index - 1)}>‹</Button>
                    <Button size="sm" variant="ghost" aria-label={`Move slide ${n} right`} disabled={index === slides.length - 1} onClick={() => move(index, index + 1)}>›</Button>
                    <Button size="sm" variant="ghost" aria-label={`Redo slide ${n}`} onClick={() => redo(index)}>Redo</Button>
                    <Button size="sm" variant="ghost" aria-label={`Send back slide ${n}`} onClick={() => { setRejecting(slide.id); setReason(''); }}>Send back</Button>
                  </div>
                  {rejecting === slide.id && (
                    <div className="space-y-1">
                      <label className="block text-[11px] text-(--text-3)">
                        What is wrong with it?
                        <textarea aria-label="What is wrong with it?" className="mt-1 w-full rounded-xl bg-(--surface-2) p-2 text-[12px] text-(--text-1)" value={reason} onChange={(e) => setReason(e.target.value)} />
                      </label>
                      <Button size="sm" variant="secondary" disabled={!reason.trim()} onClick={() => { reject(slide.id, reason.trim()); setRejecting(null); }}>
                        Send back with this reason
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(output as { pictureNote?: string } | undefined)?.pictureNote && <div className="text-[11px] text-(--text-3)">{(output as { pictureNote?: string }).pictureNote}</div>}
        {pictures.some((p) => p.status === 'pending') && <Button size="sm" variant="secondary" onClick={checkAgain}>Check again</Button>}
      </StepPanel>
    </div>
  );
}
