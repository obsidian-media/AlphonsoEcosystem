import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ContentProjectBar } from './ContentProjectBar';
import { BriefPanel } from './BriefPanel';
import { ScriptStudioTab } from './ScriptStudioTab';
import { SceneBuilderTab } from './SceneBuilderTab';
import { checkPendingClips } from '../../services/contentFactory/contentMediaExecutor';
import { ThumbnailStudioTab } from './ThumbnailStudioTab';
import { CarouselStudioTab } from './CarouselStudioTab';
import { ShortsStudioTab } from './ShortsStudioTab';
import { redoShort } from '../../services/contentFactory/shortMaker';
import { CampaignStudioTab } from './CampaignStudioTab';
import { ensureFirstBrand, getBrand, listBrands } from '../../services/contentFactory/contentBrandService';
import {
  addShortPlan, chooseVersion, createProject, emptyBrief, getProject, listProjects, recoverInterruptedSteps, reorderSlides, updateBrief,
} from '../../services/contentFactory/contentProjectService';
import { addMiniShort, approveContentStep, runContentProject, runContentStep } from '../../services/contentFactory/contentStepRunner';
import { getJoseRequest } from '../../services/jose/joseRequestStore';
import { STATUS_LABELS } from '../jose/JoseRequestsBoard';
import { Button } from '../ui';
import { checkPendingPictures, renderCarouselSlides } from '../../services/contentFactory/contentImages';
import { rejectPiece, retryWithReason, sendBackTarget } from '../../services/contentFactory/contentQualityGate';
import type { ContentProject, StepId } from '../../services/contentFactory/contentTypes';

export type ContentFactoryTab = 'script' | 'scene' | 'shorts' | 'thumbnail' | 'carousel' | 'campaign';

const LAST_KEY = 'alphonso_content_factory_last_v1';

function readLast(): { brandId?: string; projectId?: string } {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); } catch { return {}; }
}

/** Opens Miya Studio on this project next time (Chat's "Open in Miya Studio", phase 6b). */
export function selectContentProject(brandId: string, projectId: string): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ brandId, projectId })); } catch { /* storage unavailable */ }
}

/** The content factory in Miya Studio: brand, project, brief, then this tab's tool. */
export function ContentFactoryPanel({ tab, settings, brandId: brandOverride, onBrand, onOpenJoseBoard }: {
  tab: ContentFactoryTab;
  settings: { outputFolder?: string | null };
  brandId?: string;
  onBrand?(id: string): void;
  /** Opens a request on the Orchestrator's Requests tab (phase 6b). */
  onOpenJoseBoard?(requestId: string): void;
}) {
  const [brandId, setBrandId] = useState<string>(() => brandOverride || readLast().brandId || ensureFirstBrand().id);
  const [projectId, setProjectId] = useState<string | null>(() => readLast().projectId || null);
  const [version, setVersion] = useState(0);
  const [projectMessage, setProjectMessage] = useState('');
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => { recoverInterruptedSteps(); refresh(); }, [refresh]);
  useEffect(() => { if (brandOverride && brandOverride !== brandId) setBrandId(brandOverride); }, [brandOverride]);  

  const brands = useMemo(() => listBrands(), [version]);  
  const brand = getBrand(brandId) || brands[0] || null;
  const projects = useMemo(() => listProjects(brand?.id), [brand?.id, version]);  
  const project: ContentProject | null = (projectId && getProject(projectId)?.brandId === brand?.id ? getProject(projectId) : projects[0]) || null;
  const outputRoot = String(settings?.outputFolder || '').trim();

  useEffect(() => {
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ brandId: brand?.id, projectId: project?.id })); } catch { /* storage unavailable */ }
  }, [brand?.id, project?.id]);

  const request = project?.joseRequestId ? getJoseRequest(project.joseRequestId) : null;
  // The request runs on (or is carried on from the board or Telegram); keep the panel current.
  // Also while an approved post is being handed out: Publish runs in the background after
  // "Approve and schedule", and the Posts list must show where each post ended up (Jose phase 7, found by CI).
  const live = request?.status === 'running'
    || Boolean(project && Object.values(project.steps).some((s) => s.status === 'running'))
    || Boolean(project?.posts?.some((p) => p.status === 'approved' || p.status === 'posting'));
  useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  if (!brand) return null;

  const runProject = () => {
    if (!project) return;
    setProjectMessage('');
    runContentProject(project.id, { settings })
      .then((result) => { if (!result.ok) setProjectMessage(result.reason || 'The project could not start.'); })
      .catch((error) => setProjectMessage(String(error?.message || error)))
      .finally(refresh);
    refresh();
  };

  // Long steps report progress; refresh on each message so the panel shows it.
  const run = (step: StepId, extra?: string) => {
    if (!project) return;
    const pending = extra
      ? retryWithReason(project.id, step, extra, settings, refresh)
      : runContentStep(project.id, step, { settings, onProgress: refresh });
    refresh();
    // The step itself records any failure; this only keeps the window free of unhandled errors.
    pending.catch(() => undefined).finally(refresh);
  };
  const tabProps = project && {
    project,
    runStep: (step: StepId) => run(step),
    chooseVersion: (step: StepId, v: number) => { chooseVersion(project.id, step, v); refresh(); },
    // After the review this also carries the project's request on to Scenes (phase 6b).
    approve: (step: StepId) => { approveContentStep(project.id, step, settings).catch(() => undefined).finally(refresh); },
    sendBack: (step: StepId, reason: string) => {
      // Like a rejected thumbnail, the reason becomes a brand lesson (Echo).
      rejectPiece(project.id, step, step, reason);
      refresh();
      const target = sendBackTarget(step);
      if (target) run(target, reason);
    },
  };

  return (
    <div className="space-y-4">
      <ContentProjectBar
        brands={brands}
        brandId={brand.id}
        onBrand={(id) => { setBrandId(id); setProjectId(null); onBrand?.(id); }}
        projects={projects}
        projectId={project?.id || null}
        onProject={setProjectId}
        onNewProject={(name) => { const p = createProject(brand.id, name, emptyBrief()); setProjectId(p.id); refresh(); }}
        outputRoot={outputRoot}
      />
      {!project && <div className="rounded-2xl bg-(--surface-1) p-4 text-[12px] text-(--text-2)">Create a project to start: give it a name above, then write the brief.</div>}
      {project && tabProps && (
        <>
          <BriefPanel brief={project.brief} onSave={(b) => { updateBrief(project.id, b); refresh(); }} />
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-(--surface-1) p-3 text-[12px] text-(--text-2)" data-testid="content-project-request">
            <Button size="sm" onClick={runProject} disabled={live}>Run project</Button>
            <span>
              {request
                ? `Jose request: ${STATUS_LABELS[request.status] || request.status}.`
                : 'Run project runs every step through Jose and stops where you approve.'}
            </span>
            {request && onOpenJoseBoard && (
              <Button size="sm" variant="ghost" onClick={() => onOpenJoseBoard(request.id)}>Open on the board</Button>
            )}
            {projectMessage && <span className="text-(--error)">{projectMessage}</span>}
          </div>
          {tab === 'script' && <ScriptStudioTab {...tabProps} />}
          {tab === 'scene' && (
            <SceneBuilderTab project={project} outputRoot={outputRoot} runStep={tabProps.runStep} chooseVersion={tabProps.chooseVersion}
              checkAgain={() => { checkPendingPictures(project.id, 'scenes', settings).finally(refresh); }}
              onChange={refresh}
              clipsWaiting={request?.status === 'waiting_approval' && request.steps.some((s) => s.stepId === 'clips' && s.status === 'waiting_approval')}
              approveClips={() => tabProps.approve('clips')}
              checkClips={() => { checkPendingClips(project.id).catch(() => undefined).finally(refresh); }} />
          )}
          {tab === 'shorts' && (
            <ShortsStudioTab project={project} outputRoot={outputRoot} runStep={tabProps.runStep} chooseVersion={tabProps.chooseVersion}
              redo={(shortId) => { redoShort(project.id, shortId, settings).catch(() => undefined).finally(refresh); }}
              reject={(pieceId, reason) => { rejectPiece(project.id, 'shorts', pieceId, reason); refresh(); run('shorts', reason); }}
              addShort={(kind) => {
                if (kind === 'mini') { void addMiniShort(project.id, settings).finally(refresh); return; }
                try { addShortPlan(project.id, kind); } finally { refresh(); }
              }}
              onChange={refresh} />
          )}
          {tab === 'thumbnail' && (
            <ThumbnailStudioTab project={project} outputRoot={outputRoot} runStep={tabProps.runStep} chooseVersion={tabProps.chooseVersion}
              reject={(pieceId, reason) => { rejectPiece(project.id, 'thumbnail', pieceId, reason); refresh(); run('thumbnail', reason); }}
              checkAgain={() => { checkPendingPictures(project.id, 'thumbnail', settings).finally(refresh); }} />
          )}
          {tab === 'carousel' && (
            <CarouselStudioTab project={project} outputRoot={outputRoot} runStep={tabProps.runStep} chooseVersion={tabProps.chooseVersion}
              redo={(index) => { renderCarouselSlides(project.id, settings, undefined, index).catch(() => undefined).finally(refresh); }}
              move={(from, to) => { try { reorderSlides(project.id, from, to); } finally { refresh(); } }}
              reject={(pieceId, reason) => { rejectPiece(project.id, 'carousel', pieceId, reason); refresh(); run('carousel', reason); }}
              checkAgain={() => { checkPendingPictures(project.id, 'carousel', settings).finally(refresh); }} />
          )}
          {tab === 'campaign' && <CampaignStudioTab {...tabProps} brand={brand} outputRoot={outputRoot} onChange={refresh} />}
        </>
      )}
    </div>
  );
}
