import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
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
import { BrandHeader } from '../workspace/BrandHeader';
import { BrandSettings } from '../workspace/BrandSettings';
import { ContentCalendar } from '../workspace/ContentCalendar';
import { hydrateContentJobsFromSqlite, persistContentJobsToSqlite } from '../services/contentPersistenceService';
import { DraftList } from '../workspace/DraftList';
import { DraftPreview } from '../workspace/DraftPreview';
import { GeneratorForm } from '../workspace/GeneratorForm';
import { TrendResearch } from '../workspace/TrendResearch';

const DEFAULT_FORM = createDefaultContentRequest();

export function ContentCatalystWorkspace({ settings, onJobChange, onApprovalRequest }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [jobs, setJobs] = useState(() => listContentJobs());
  const contentHydratedRef = useRef(false);
  const [brandProfile, setBrandProfile] = useState(() => getBrandProfile());
  const [activeJobId, setActiveJobId] = useState(() => listContentJobs()[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [injectedIdea, setInjectedIdea] = useState('');
  const [bridgeConfig, setBridgeConfig] = useState(() => getAccBridgeConfig());
  const [bridgeStatus, setBridgeStatus] = useState(() => getAccBridgeStatus());
  const [bridgePackets, setBridgePackets] = useState(() => listAccBridgePackets(8));
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeNotice, setBridgeNotice] = useState('');

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

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6">
      <BrandHeader
        brandProfile={brandProfile}
        analytics={analytics}
        onToggleSettings={() => {
          setShowSettings((value) => !value);
          setShowTrends(false);
          setShowAnalytics(false);
        }}
        onToggleTrends={() => {
          setShowTrends((value) => !value);
          setShowSettings(false);
          setShowAnalytics(false);
        }}
        onToggleAnalytics={() => {
          setShowAnalytics((value) => !value);
          setShowSettings(false);
          setShowTrends(false);
        }}
        showSettings={showSettings}
        showTrends={showTrends}
        showAnalytics={showAnalytics}
      />

      {(showSettings || showTrends || showAnalytics) && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {showSettings ? <BrandSettings brandProfile={brandProfile} onSave={handleBrandSave} /> : null}
          {showTrends ? (
            <TrendResearch
              suggestions={trendSuggestions}
              onUseIdea={(idea) => {
                setInjectedIdea(idea);
                setShowTrends(false);
              }}
            />
          ) : null}
          {showAnalytics ? <AnalyticsDashboard analytics={analytics} /> : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
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

          <ContentCalendar
            drafts={drafts}
            onAssignDay={handleAssignDay}
            onSelectDraft={setActiveJobId}
            onPublish={(draft, type) => {
              const selected = drafts.find((item) => item.id === draft.id);
              if (selected) setActiveJobId(selected.id);
              if (type === 'video' && activeJob?.id === draft.id) runStep('video');
              if (type === 'image' && activeJob?.id === draft.id) runStep('image');
            }}
          />
        </div>

        <div className="space-y-4">
          {/* ACC Bridge — compact 2-way status indicator. Full config is in Settings → Connectors */}
          <div className="rounded-3xl border border-cyan-400/20 bg-zinc-950/90 px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${bridgeStatus.configured ? 'text-cyan-400' : 'text-zinc-600'}`} />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">ACC Bridge</div>
                <div className="text-sm text-zinc-300 mt-0.5">
                  {bridgeStatus.configured
                    ? <span className="text-cyan-300">Connected · {bridgeStatus.status || 'ok'}</span>
                    : <span className="text-zinc-500">Not configured — set up in <span className="text-zinc-300">Settings → Connectors</span></span>
                  }
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activeJob && bridgeStatus.configured && (
                <button
                  type="button"
                  disabled={bridgeBusy}
                  onClick={handleBridgeSyncActiveJob}
                  className="rounded-full border border-cyan-400/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:opacity-50"
                >
                  Sync
                </button>
              )}
              <button
                type="button"
                onClick={refreshBridge}
                className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:border-cyan-400/40 hover:text-white"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Bridge response</span>
            </div>
            <div className="p-4">
              {bridgeResponse ? (
                <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3 text-[10px] leading-relaxed text-[var(--text-2)]">
                  {JSON.stringify(bridgeResponse, null, 2)}
                </pre>
              ) : (
                <div className="text-[10px] text-[var(--text-4)]">Create a job to see the bridge contract response.</div>
              )}
            </div>
          </div>

          <DraftPreview activeJob={activeJob} busy={busy} onRunStep={runStep} onApprovePublish={handlePublish} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DraftList drafts={drafts} onSelect={setActiveJobId} />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
            <ArrowRight className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Job detail</span>
          </div>
          <div className="p-4">
            {activeJob ? (
              <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3 text-[10px] leading-relaxed text-[var(--text-2)]">
                {JSON.stringify(activeJob, null, 2)}
              </pre>
            ) : (
              <div className="text-[10px] text-[var(--text-4)]">Select a draft to inspect the full job payload.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
