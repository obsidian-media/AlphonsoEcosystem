import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ContentProjectBar } from './ContentProjectBar';
import { BriefPanel } from './BriefPanel';
import { ScriptStudioTab } from './ScriptStudioTab';
import { SceneBuilderTab } from './SceneBuilderTab';
import { ThumbnailStudioTab } from './ThumbnailStudioTab';
import { CampaignStudioTab } from './CampaignStudioTab';
import { ensureFirstBrand, getBrand, listBrands } from '../../services/contentFactory/contentBrandService';
import {
  approveStep, chooseVersion, createProject, emptyBrief, getProject, listProjects, recoverInterruptedSteps, sendBackStep, updateBrief,
} from '../../services/contentFactory/contentProjectService';
import { runContentStep } from '../../services/contentFactory/contentStepRunner';
import { checkPendingPictures } from '../../services/contentFactory/contentImages';
import { rejectPiece, retryWithReason } from '../../services/contentFactory/contentQualityGate';
import type { ContentProject, StepId } from '../../services/contentFactory/contentTypes';

export type ContentFactoryTab = 'script' | 'scene' | 'thumbnail' | 'campaign';

const LAST_KEY = 'alphonso_content_factory_last_v1';

function readLast(): { brandId?: string; projectId?: string } {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); } catch { return {}; }
}

/** The content factory in Miya Studio: brand, project, brief, then this tab's tool. */
export function ContentFactoryPanel({ tab, settings, brandId: brandOverride, onBrand }: {
  tab: ContentFactoryTab;
  settings: { outputFolder?: string | null };
  brandId?: string;
  onBrand?(id: string): void;
}) {
  const [brandId, setBrandId] = useState<string>(() => brandOverride || readLast().brandId || ensureFirstBrand().id);
  const [projectId, setProjectId] = useState<string | null>(() => readLast().projectId || null);
  const [version, setVersion] = useState(0);
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

  if (!brand) return null;

  // Long steps report progress; refresh on each message so the panel shows it.
  const run = (step: StepId, extra?: string) => {
    if (!project) return;
    const pending = extra
      ? retryWithReason(project.id, step, extra, settings)
      : runContentStep(project.id, step, { settings, onProgress: refresh });
    refresh();
    pending.finally(refresh);
  };
  const tabProps = project && {
    project,
    runStep: (step: StepId) => run(step),
    chooseVersion: (step: StepId, v: number) => { chooseVersion(project.id, step, v); refresh(); },
    approve: (step: StepId) => { approveStep(project.id, step); refresh(); },
    sendBack: (step: StepId, reason: string) => { sendBackStep(project.id, step, reason); refresh(); run(step, reason); },
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
          {tab === 'script' && <ScriptStudioTab {...tabProps} />}
          {tab === 'scene' && (
            <SceneBuilderTab project={project} outputRoot={outputRoot} runStep={tabProps.runStep} chooseVersion={tabProps.chooseVersion}
              checkAgain={() => { checkPendingPictures(project.id, 'scenes', settings).finally(refresh); }} />
          )}
          {tab === 'thumbnail' && (
            <ThumbnailStudioTab project={project} outputRoot={outputRoot} runStep={tabProps.runStep} chooseVersion={tabProps.chooseVersion}
              reject={(pieceId, reason) => { rejectPiece(project.id, 'thumbnail', pieceId, reason); refresh(); run('thumbnail', reason); }}
              checkAgain={() => { checkPendingPictures(project.id, 'thumbnail', settings).finally(refresh); }} />
          )}
          {tab === 'campaign' && <CampaignStudioTab {...tabProps} brand={brand} />}
        </>
      )}
    </div>
  );
}
