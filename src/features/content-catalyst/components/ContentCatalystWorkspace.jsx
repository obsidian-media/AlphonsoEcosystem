import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { requireApproval } from '../../../services/approval/approvalService';
import {
  getAccBridgeConfig,
  getAccBridgeStatus,
  listAccBridgePackets,
  resetAccBridgeConfig,
  refreshAccBridgeStatus,
  syncContentCatalystJob,
  updateAccBridgeConfig
} from '../../../services/agentWorkshop/accBridgeService';
import {
  createContentBridgeRequest,
  createContentBridgeResponse,
  generateContentDraft,
  generateContentImage,
  generateContentNarration,
  generateContentPreview,
  generateContentVideo,
  listContentJobs,
  publishContent,
  publishContentPreview,
  runContentCatalystJob,
  upsertContentJob
} from '../services/contentCatalystService';
import {
  assignDraftSchedule,
  getBrandProfile,
  getContentAnalyticsSnapshot,
  getTrendResearchSuggestions,
  listDraftHistory,
  saveBrandProfile
} from '../state/contentCatalystState';
import { createDefaultContentRequest } from '../types/contentCatalystTypes';
import { AnalyticsDashboard } from '../workspace/AnalyticsDashboard';
import { BrandSettings } from '../workspace/BrandSettings';
import { ContentCalendar } from '../workspace/ContentCalendar';
import { hydrateContentJobsFromSqlite, persistContentJobsToSqlite } from '../services/contentPersistenceService';
import { DraftList } from '../workspace/DraftList';
import { DraftPreview } from '../workspace/DraftPreview';
import { GeneratorForm } from '../workspace/GeneratorForm';
import { TrendResearch } from '../workspace/TrendResearch';
import { getAllStatus, startTool, waitForTool } from '../../../services/runtimeManagerService';

const DEFAULT_FORM = createDefaultContentRequest();

export function ContentCatalystWorkspace({ settings, onJobChange, onApprovalRequest }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [jobs, setJobs] = useState(() => listContentJobs());
  const contentHydratedRef = useRef(false);
  const [brandProfile, setBrandProfile] = useState(() => getBrandProfile());
  const [activeJobId, setActiveJobId] = useState(() => listContentJobs()[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [injectedIdea, setInjectedIdea] = useState('');
  const [bridgeConfig, setBridgeConfig] = useState(() => getAccBridgeConfig());
  const [bridgeStatus, setBridgeStatus] = useState(() => getAccBridgeStatus());
  const [bridgePackets, setBridgePackets] = useState(() => listAccBridgePackets(8));
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeNotice, setBridgeNotice] = useState('');
  const [imageRuntime, setImageRuntime] = useState({ checked: false, running: false, installed: false, starting: false, message: '' });

  const refreshImageRuntime = async () => {
    const tools = await getAllStatus().catch(() => []);
    const comfyui = tools.find((tool) => tool.name === 'comfyui');
    setImageRuntime((current) => ({ ...current, checked: true, running: Boolean(comfyui?.running), installed: Boolean(comfyui?.installed), message: comfyui?.running ? 'ComfyUI ready' : comfyui?.installed ? 'ComfyUI stopped' : 'ComfyUI not installed' }));
  };

  useEffect(() => {
    setJobs(listContentJobs());
    if (contentHydratedRef.current) return;
    contentHydratedRef.current = true;
    hydrateContentJobsFromSqlite().then((sqliteJobs) => {
      if (!sqliteJobs || sqliteJobs.length === 0) return;
      // Merge SQLite jobs with any already in localStorage (SQLite wins on conflict)
      const localIds = new Set(listContentJobs().map((j) => j.id));
      const newOnes = sqliteJobs.filter((j) => !localIds.has(j.id));
      if (newOnes.length > 0) setJobs((current) => [...newOnes, ...current]);
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshImageRuntime(); }, []);

  const startImageRuntime = async () => {
    setImageRuntime((current) => ({ ...current, starting: true, message: 'Starting ComfyUI…' }));
    const result = await startTool('comfyui').catch((error) => ({ ok: false, message: String(error) }));
    const running = result?.ok ? await waitForTool('comfyui', 20_000) : false;
    setImageRuntime((current) => ({ ...current, starting: false, running, message: running ? 'ComfyUI ready' : result?.message || 'Could not start ComfyUI' }));
  };

  useEffect(() => {
    if (jobs.length > 0) persistContentJobsToSqlite(jobs).catch(() => {});
  }, [jobs]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const runtimeStatus = await refreshAccBridgeStatus();
      if (!mounted) return;
      setBridgeConfig(getAccBridgeConfig());
      setBridgeStatus(runtimeStatus);
      setBridgePackets(listAccBridgePackets(8));
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const activeJob = useMemo(() => jobs.find((job) => job.id === activeJobId) || jobs[0] || null, [jobs, activeJobId]);
  const drafts = useMemo(() => listDraftHistory(), [jobs]);
  const analytics = useMemo(() => getContentAnalyticsSnapshot(), [jobs]);
  const trendSuggestions = useMemo(() => getTrendResearchSuggestions(brandProfile, drafts), [brandProfile, drafts]);
  const bridgeResponse = activeJob ? createContentBridgeResponse(activeJob) : null;
  const creativeState = activeJob?.status === 'failed'
    ? 'Needs attention'
    : activeJob?.assets?.image_url || activeJob?.assets?.image_preview_base64
      ? 'Asset ready'
      : activeJob ? 'In creation' : 'Ready to create';

  const refresh = (nextActiveId = activeJobId) => {
    const nextJobs = listContentJobs();
    setJobs(nextJobs);
    if (nextActiveId) setActiveJobId(nextActiveId);
    onJobChange?.(nextJobs.find((job) => job.id === nextActiveId) || nextJobs[0] || null);
  };

  const createJob = async () => {
    setBusy(true);
    try {
      const request = createContentBridgeRequest({
        ...form,
        needs: {
          image: form.needs.image,
          video: form.needs.video,
          narration: form.needs.narration,
          publish: form.needs.publish
        }
      });
      const launched = await runContentCatalystJob(request, {
        workspaceRoot: settings.workspaceRoot,
        brandProfile
      });
      setJobs(listContentJobs());
      setActiveJobId(launched.id);
      onJobChange?.(launched);
      return launched;
    } finally {
      setBusy(false);
    }
  };

  const runStep = async (step) => {
    if (!activeJob) return;
    setBusy(true);
    try {
      let next = activeJob;
      if (step === 'draft') next = await generateContentDraft(activeJob);
      if (step === 'image') next = await generateContentImage(activeJob);
      if (step === 'video') next = await generateContentVideo(activeJob);
      if (step === 'narration') next = await generateContentNarration(activeJob);
      if (step === 'preview') next = await generateContentPreview(activeJob);
      if (step === 'publish-preview') next = await publishContentPreview(activeJob);
      if (step === 'publish') next = await publishContent(activeJob, { approved: true });
      if (next?.id) {
        upsertContentJob(next);
        refresh(next.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    const approval = await requireApproval({
      actionType: 'external_posting_uploading',
      summary: activeJob?.request?.idea || 'Content publish request',
      requestedBy: 'jose',
      workflowId: 'content_catalyst_publish'
    });
    onApprovalRequest?.(approval);
    if (!approval.ok) return;
    runStep('publish');
  };

  const handleBrandSave = (nextBrandProfile) => {
    const saved = saveBrandProfile(nextBrandProfile);
    setBrandProfile(saved);
  };

  const refreshBridge = () => {
    (async () => {
      const runtimeStatus = await refreshAccBridgeStatus();
      setBridgeConfig(getAccBridgeConfig());
      setBridgeStatus(runtimeStatus);
      setBridgePackets(listAccBridgePackets(8));
    })();
  };

  const handleBridgeSave = async () => {
    setBridgeBusy(true);
    setBridgeNotice('');
    try {
      updateAccBridgeConfig(bridgeConfig);
      refreshBridge();
      setBridgeNotice('Bridge settings saved.');
    } finally {
      setBridgeBusy(false);
    }
  };

  const handleBridgeReset = async () => {
    setBridgeBusy(true);
    setBridgeNotice('');
    try {
      const next = resetAccBridgeConfig();
      setBridgeConfig(next);
      refreshBridge();
      setBridgeNotice('Bridge settings reset.');
    } finally {
      setBridgeBusy(false);
    }
  };

  const handleBridgeSyncActiveJob = async () => {
    if (!activeJob) return;
    setBridgeBusy(true);
    setBridgeNotice('');
    try {
      const result = await syncContentCatalystJob(activeJob, {
        workspaceRoot: settings.workspaceRoot,
        eventType: 'manual_sync'
      });
      refreshBridge();
      setBridgeNotice(result?.ok ? 'Active job synced to ACC.' : result?.error || 'Bridge sync failed.');
    } finally {
      setBridgeBusy(false);
    }
  };

  const handleAssignDay = async (draftId, dateString) => {
    assignDraftSchedule(draftId, dateString);
    refresh(activeJobId);
  };

  const [contentTab, setContentTab] = useState('create');

  const CONTENT_TABS = [
    { id: 'create', label: 'Create' },
    { id: 'drafts', label: 'Drafts' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'brand', label: 'Brand' },
  ];

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* Page header */}
      <header className="relative overflow-hidden rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.13] via-[var(--surface-1)] to-violet-500/[0.10] px-5 py-5 flex items-center justify-between gap-4">
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Creation room</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Content Studio</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-200">Make the asset. Ship the story.</p>
          <p className="mt-1 text-xs text-zinc-400">Brief → copy → image → motion → approved distribution. Every output stays attached to the job.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-zinc-300">{analytics?.totalDrafts ?? 0} drafts</span>
            <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-zinc-300">{analytics?.publishedCount ?? 0} published</span>
            <span className={`rounded-full border px-2.5 py-1 ${activeJob?.status === 'failed' ? 'border-rose-400/30 text-rose-200' : 'border-cyan-400/30 text-cyan-200'}`}>{creativeState}</span>
          </div>
        </div>
        {/* ACC Bridge pill */}
        <div className="flex items-center gap-2 shrink-0">
          <CheckCircle2 className={`h-3.5 w-3.5 ${bridgeStatus.configured ? 'text-cyan-400' : 'text-zinc-600'}`} />
          <span className="text-[11px] text-zinc-400">
            {bridgeStatus.configured ? <span className="text-cyan-300">ACC Bridge connected</span> : 'ACC Bridge off'}
          </span>
          {activeJob && bridgeStatus.configured && (
            <button
              type="button"
              disabled={bridgeBusy}
              onClick={handleBridgeSyncActiveJob}
              className="rounded-full border border-[var(--accent-border)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)] transition hover:border-[var(--accent)] hover:text-white disabled:opacity-50"
            >
              Sync
            </button>
          )}
          <button
            type="button"
            onClick={refreshBridge}
            className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition hover:text-white"
          >
            ↺
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1">
        {CONTENT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setContentTab(tab.id)}
            className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              contentTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {tab.id === 'drafts' && drafts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] text-cyan-300">{drafts.length}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
      <motion.div
        key={contentTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
      >

      {/* Create tab */}
      {contentTab === 'create' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <GeneratorForm
            form={form}
            setForm={setForm}
            brandProfile={brandProfile}
            injectedIdea={injectedIdea}
            onIdeaUsed={() => {
              setForm((current) => ({ ...current, idea: injectedIdea }));
              setInjectedIdea('');
            }}
            onGenerate={createJob}
            isLoading={busy}
          />
          <DraftPreview activeJob={activeJob} busy={busy} onRunStep={runStep} onApprovePublish={handlePublish} imageRuntime={imageRuntime} onStartImageRuntime={startImageRuntime} />
        </div>
      )}

      {/* Drafts tab */}
      {contentTab === 'drafts' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.1fr]">
          <DraftList drafts={drafts} onSelect={(id) => { setActiveJobId(id); }} />
          <DraftPreview activeJob={activeJob} busy={busy} onRunStep={runStep} onApprovePublish={handlePublish} imageRuntime={imageRuntime} onStartImageRuntime={startImageRuntime} />
        </div>
      )}

      {/* Calendar tab */}
      {contentTab === 'calendar' && (
        <ContentCalendar
          drafts={drafts}
          onAssignDay={handleAssignDay}
          onSelectDraft={(id) => { setActiveJobId(id); setContentTab('drafts'); }}
          onPublish={(draft, type) => {
            const selected = drafts.find((item) => item.id === draft.id);
            if (selected) setActiveJobId(selected.id);
            if (type === 'video' && activeJob?.id === draft.id) runStep('video');
            if (type === 'image' && activeJob?.id === draft.id) runStep('image');
          }}
        />
      )}

      {/* Analytics tab */}
      {contentTab === 'analytics' && (
        <AnalyticsDashboard analytics={analytics} />
      )}

      {/* Brand tab */}
      {contentTab === 'brand' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <BrandSettings brandProfile={brandProfile} onSave={handleBrandSave} />
          <TrendResearch
            suggestions={trendSuggestions}
            onUseIdea={(idea) => {
              setInjectedIdea(idea);
              setContentTab('create');
            }}
          />
        </div>
      )}

      </motion.div>
      </AnimatePresence>

    </div>
    </div>
  );
}
