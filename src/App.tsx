import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useVoiceInput } from './hooks/useVoiceInput';
import { getVerificationLogs } from './services/verificationService';
import { appendVerificationLog } from './services/verificationService';
import { TRUST_STATES } from './services/trustModel';
import { sendNativeNotification } from './services/notificationService';
import { needsHighRiskApproval } from './lib/chatUtils';
import { UpdaterNotification } from './components/UpdaterNotification';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { useToast } from './components/ToastProvider';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OllamaOfflineBanner } from './components/OllamaOfflineBanner';
import { NotificationCenter } from './components/NotificationCenter';
import { CoachWindow } from './components/CoachWindow';
import { ViewLoadingState } from './components/ViewLoadingState';
import { useAppKeyboardShortcuts } from './hooks/useAppKeyboardShortcuts';
import { useIdleLock } from './hooks/useIdleLock';
import { useAppShellState } from './hooks/useAppShellState';

import {
  VERIFICATION_LOG_CAP,
  themeClassFromSettings,
  getCompanionState,
} from './constants/appConstants';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { OllamaProvider, useOllama } from './contexts/OllamaContext';
import { PluginProvider, usePlugins } from './contexts/PluginContext';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { VerificationProvider, useVerification } from './contexts/VerificationContext';
import { CoachProvider, useCoach } from './contexts/CoachContext';

const ChatView = lazy(() => import('./components/ChatView').then((mod) => ({ default: mod.ChatView })));
const WorkflowPanel = lazy(() => import('./components/WorkflowPanel').then((mod) => ({ default: mod.WorkflowPanel })));
const CoachHardInterruptOverlay = lazy(() => import('./components/CoachHardInterruptOverlay').then((mod) => ({ default: mod.CoachHardInterruptOverlay })));
const ApprovalModal = lazy(() => import('./components/ApprovalModal').then((mod) => ({ default: mod.ApprovalModal })));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard').then((mod) => ({ default: mod.OnboardingWizard })));
const ConnectorHealthPanel = lazy(() => import('./components/ConnectorHealthPanel').then((mod) => ({ default: mod.ConnectorHealthPanel })));
const RuntimeManagerView = lazy(() => import('./components/RuntimeManagerView'));
const BootStatusBanner = lazy(() => import('./components/BootStatusBanner').then((mod) => ({ default: mod.BootStatusBanner })));
const MissionControlHome = lazy(() => import('./components/MissionControlHome').then((mod) => ({ default: mod.MissionControlHome })));
const MissionRoom = lazy(() => import('./components/MissionRoom').then((mod) => ({ default: mod.MissionRoom })));
const AutomationView = lazy(() => import('./components/AutomationView').then((mod) => ({ default: mod.AutomationView })));
const FilesView = lazy(() => import('./components/FilesView').then((mod) => ({ default: mod.FilesView })));
const EcosystemHub = lazy(() => import('./components/EcosystemHub').then((mod) => ({ default: mod.EcosystemHub })));
const HectorResearchDesk = lazy(() => import('./components/dashboard/HectorResearchDesk').then((mod) => ({ default: mod.HectorResearchDesk })));
const MiyaStudio = lazy(() => import('./components/MiyaStudio').then((mod) => ({ default: mod.MiyaStudio })));
const ContentCatalystWorkspace = lazy(() => import('./features/content-catalyst').then((mod) => ({ default: mod.ContentCatalystWorkspace })));
const OperatorDashboard = lazy(() => import('./components/OperatorDashboard').then((mod) => ({ default: mod.OperatorDashboard })));
const OrchestratorView = lazy(() => import('./components/OrchestratorView').then((mod) => ({ default: mod.OrchestratorView })));
const ProjectExecutionMode = lazy(() => import('./components/projectExecution/ProjectExecutionMode').then((mod) => ({ default: mod.ProjectExecutionMode })));
const CommandRib = lazy(() => import('./components/CommandRib').then((mod) => ({ default: mod.CommandRib })));
const AgentDock = lazy(() => import('./components/AgentDock').then((mod) => ({ default: mod.AgentDock })));
const SettingsView = lazy(() => import('./components/SettingsView').then((mod) => ({ default: mod.SettingsView })));
const RightPanel = lazy(() => import('./components/RightPanel').then((mod) => ({ default: mod.RightPanel })));
const AgentActivityLog = lazy(() => import('./components/AgentActivityLog').then((mod) => ({ default: mod.AgentActivityLog })));

const parsedSearchParams = new URLSearchParams(window.location.search);
const IS_COACH_WINDOW = parsedSearchParams.get('coach') === '1';
const COACH_AGENT_FROM_QUERY = parsedSearchParams.get('coachAgent');

// Context value types
interface VerificationLogsBridgeValue {
  verificationLogs: unknown[];
  setVerificationLogs: React.Dispatch<React.SetStateAction<unknown[]>>;
  durableAuditLogs: unknown[];
  setDurableAuditLogs: React.Dispatch<React.SetStateAction<unknown[]>>;
  auditChainProof: unknown;
  setAuditChainProof: React.Dispatch<React.SetStateAction<unknown>>;
  approvalRequiredNotice: boolean;
  setApprovalRequiredNotice: React.Dispatch<React.SetStateAction<boolean>>;
}

interface RequestApprovalBridgeValue {
  approvalPending: string | null;
  setApprovalPending: React.Dispatch<React.SetStateAction<string | null>>;
  requestApproval: (actionLabel: string) => Promise<boolean>;
  approvalResolveRef: React.MutableRefObject<((value: boolean) => void) | null>;
}

const VerificationLogsBridge = React.createContext<VerificationLogsBridgeValue | null>(null);
export function useVerificationLogsBridge() { return React.useContext(VerificationLogsBridge); }

const RequestApprovalBridge = React.createContext<RequestApprovalBridgeValue | null>(null);
export function useRequestApprovalBridge() { return React.useContext(RequestApprovalBridge); }

function AppShell() {
  const isCoachWindow = IS_COACH_WINDOW;
  const coachAgentFromQuery = COACH_AGENT_FROM_QUERY;
  const { settings, setSettings, operatorMode, setOperatorMode } = useSettings();
  const { ollamaStatus, desktopBridge, lastCheckedAt, installedModels, selectedModelMissing, runOllamaCheck, copyTroubleshootingCommand, copyState, ollamaCheckRunRef } = useOllama();
  const { plugins, pluginAudit, pluginSandboxPolicy, diskPluginManifests, lastPluginToolRun, lastManifestValidation, handleTogglePlugin, handleExecutePluginTool, handleValidatePluginManifest, handleDiscoverPlugins, handleUpdatePluginSandboxPolicy } = usePlugins();
  const { workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastOcrAdapterRun, handleRunWorkspaceProof, handleCheckOcrCapability, handleBuildSymbolIndex, handleRunOcrAdapter, handleToggleWorkspaceFeature } = useWorkspace();
  const { verificationLogs, durableAuditLogs, auditChainProof, setVerificationLogs, setDurableAuditLogs, verifyOllamaWithProof, verifyProcesses, verifyPaths, verifyAuditChain, verifyCommand, handleRunReleasePreflight, handleRuntimeRepair } = useVerification();
  const { coachMode, coachAlwaysOnTop, coachMiniMode, coachSnapCorner, coachIntervention, coachPauseUntilMs, setCoachMode, setCoachMiniMode, setCoachAlwaysOnTop, handleToggleCoachMode, handleToggleCoachTop, handleCoachInterventionAction, minimizeToCoach } = useCoach();
  const voice = useVoiceInput();
  const toast = useToast();
  const [updaterVersion, setUpdaterVersion] = useState<string | null>(null);

  // Notification center state
  type NotificationType = 'success' | 'warning' | 'error' | 'info';
  interface AppNotification { id: string; type: NotificationType; title: string; message: string; timestamp: number; }
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0);

  const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'timestamp'>) => {
    setNotifications((prev) => [
      { ...n, id: `notif-${Date.now()}-${Math.random()}`, timestamp: Date.now() },
      ...prev,
    ].slice(0, 50));
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => setNotifications([]), []);

  // Poll orchestration receipts every 30s and push notifications for new completions/approvals
  const lastReceiptCountRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const { listOrchestrationReceipts } = await import('./services/orchestrationReceiptService');
        const receipts = listOrchestrationReceipts ? listOrchestrationReceipts() : [];
        if (receipts.length > lastReceiptCountRef.current) {
          const newOnes = receipts.slice(lastReceiptCountRef.current);
          newOnes.forEach((r: any) => {
            if (r.status === 'completed') {
              addNotification({ type: 'success', title: `${r.agent || 'Agent'} completed`, message: r.details?.summary || r.eventType || 'Task finished.' });
            } else if (r.status === 'failed' || r.blocked) {
              addNotification({ type: 'error', title: `${r.agent || 'Agent'} failed`, message: r.details?.error || r.eventType || 'Task failed.' });
            }
          });
          lastReceiptCountRef.current = receipts.length;
        }
      } catch { /* non-critical */ }
    };
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [addNotification]);

  const {
    activeTab, isSidebarOpen, conversations, activeChatId,
    isGeneratingResponse, setIsGeneratingResponse, lastTaskCompletedAt, isOnline, isLocked,
    memoryItems, screenObserverState, screenObserverLogs,
    miyaCompanionState, joseCompanionState, hectorCompanionState,
    snapshots, showWorkflowPanel, approvalRequiredNotice, approvalPending,
    showOnboarding, nativeSelfDevProof, updateCheckState, braveSearchConfigured,
    approvalResolveRef, idleTimerRef, screenObserverRunRef,
    switchTab, mergedAgentDockCompanions, nativeProofHooks,
    setConversations, setActiveChatId, setIsSidebarOpen, setIsLocked, setIsOnline,
    setMemoryItems, setScreenObserverState, setScreenObserverLogs,
    setMiyaCompanionState, setJoseCompanionState, setHectorCompanionState,
    setSnapshots, setShowWorkflowPanel, setApprovalRequiredNotice, setApprovalPending,
    setShowOnboarding, setNativeSelfDevProof, setUpdateCheckState, setBraveSearchConfigured,
    setLastTaskCompletedAt, requestApproval, createNewChat, deleteChat,
    handleCreateSnapshot, handleRestoreSnapshot, handleBackupMemory,
    handleRequestScreenObserverPermission, handleStartScreenObserver,
    handleStopScreenObserver, handleUpdateScreenObserverSettings, handleExportDiagnostics
  } = useAppShellState({
    settings, setSettings, operatorMode, setOperatorMode,
    ollamaStatus, desktopBridge, lastCheckedAt, installedModels, selectedModelMissing, runOllamaCheck, copyTroubleshootingCommand, copyState,
    plugins, pluginAudit, pluginSandboxPolicy, diskPluginManifests, lastPluginToolRun, lastManifestValidation, handleTogglePlugin, handleExecutePluginTool, handleValidatePluginManifest, handleDiscoverPlugins, handleUpdatePluginSandboxPolicy,
    workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastOcrAdapterRun, handleRunWorkspaceProof, handleCheckOcrCapability, handleBuildSymbolIndex, handleRunOcrAdapter, handleToggleWorkspaceFeature,
    verificationLogs, durableAuditLogs, auditChainProof, setVerificationLogs, setDurableAuditLogs, verifyOllamaWithProof, verifyProcesses, verifyPaths, verifyAuditChain, verifyCommand, handleRunReleasePreflight, handleRuntimeRepair,
    coachMode, coachAlwaysOnTop, coachMiniMode, coachSnapCorner, coachIntervention, coachPauseUntilMs, setCoachMode, setCoachMiniMode, setCoachAlwaysOnTop, handleToggleCoachMode, handleToggleCoachTop, handleCoachInterventionAction, minimizeToCoach,
    voice, toast
  });

  // Push notification when approval is required — must be after useAppShellState
  const prevApprovalPending = useRef<string | null>(null);
  useEffect(() => {
    if (approvalRequiredNotice && !prevApprovalPending.current) {
      addNotification({ type: 'warning', title: 'Approval needed', message: 'A task is waiting for your review.' });
    }
    prevApprovalPending.current = approvalRequiredNotice ? 'pending' : null;
  }, [approvalRequiredNotice, addNotification]);

  const companion = getCompanionState({
    ollamaStatus, voiceStatus: voice.voiceStatus, isGeneratingResponse,
    lastTaskCompletedAt, selectedModelMissing,
    privacyModeActive: settings.privacyShieldActive, approvalModeActive: settings.approvalMode,
    approvalRequiredNotice
  });

  useAppKeyboardShortcuts({ approvalPending, setApprovalPending, setApprovalRequiredNotice, approvalResolveRef, switchTab });
  useIdleLock({ idleTimeoutMinutes: settings.idleTimeoutMinutes, setIsLocked, idleTimerRef });

  // Echo end-of-session synthesis on window close
  useEffect(() => {
    let unlisten = null;
    let registered = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { synthesizeSession } = await import('./services/echoMemoryService');
        unlisten = await listen('tauri://close-requested', async () => {
          try {
            const rawMessages = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('alphonso_messages_')) {
                try {
                  const parsed = JSON.parse(localStorage.getItem(key) || '[]');
                  if (Array.isArray(parsed)) rawMessages.push(...parsed.slice(-20));
                } catch { /* skip */ }
              }
            }
            await synthesizeSession(rawMessages.slice(-20));
          } catch { /* non-critical */ }
        });
        registered = true;
      } catch { /* Tauri API not available in browser */ }
    })();
    return () => {
      if (registered && unlisten) { try { unlisten(); } catch { /* ignore */ } }
    };
  }, []);

  // Boot-time autostart: start tools the user enabled autostart for
  useEffect(() => {
    (async () => {
      try {
        const { getAutostartPrefs, startTool } = await import('./services/runtimeManagerService');
        const prefs = await getAutostartPrefs();
        for (const [name, enabled] of Object.entries(prefs)) {
          if (enabled) {
            startTool(name).catch(() => { /* best-effort */ });
          }
        }
      } catch { /* Tauri not available or prefs unset */ }
    })();
  }, []);

  // Wire background services: Sentinel scheduled scans + Maria weekly report
  useEffect(() => {
    let scanStop: (() => void) | null = null;
    let weeklyStop: (() => void) | null = null;
    (async () => {
      try {
        const { startScheduledScans } = await import('./services/sentinelSecurityService');
        scanStop = startScheduledScans(10 * 60 * 1000, (result: any) => {
          if (result?.findings?.length) {
            addNotification({ type: 'warning', title: 'Sentinel scan complete', message: `${result.findings.length} finding(s) detected.` });
          }
        });
      } catch { /* non-critical */ }
      try {
        const { scheduleWeeklyGeneration } = await import('./services/mariaWeeklyReportService');
        weeklyStop = scheduleWeeklyGeneration((report: any) => {
          if (report) {
            addNotification({ type: 'info', title: 'Maria weekly report ready', message: report.summary || 'Governance report generated.' });
          }
        });
      } catch { /* non-critical */ }
    })();
    return () => {
      try { scanStop?.(); } catch { /* ignore */ }
      try { weeklyStop?.(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Echo file watcher background service
  useEffect(() => {
    let watcherStop: (() => void) | null = null;
    (async () => {
      try {
        const { startFileWatcher, getWatcherConfig } = await import('./services/echoFileWatcherService');
        const config = getWatcherConfig();
        if (config?.enabled && config?.inboxPath) {
          watcherStop = startFileWatcher((result) => {
            if (result?.ingested > 0) {
              addNotification({
                type: 'success',
                title: 'Echo auto-ingest',
                message: `${result.ingested} file(s) ingested from inbox.`
              });
            }
          });
        }
      } catch { /* non-critical */ }
    })();
    return () => { try { watcherStop?.(); } catch { /* ignore */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isCoachWindow) {
    return (
      <CoachWindow
        coachAgentFromQuery={coachAgentFromQuery}
        miyaCompanionState={miyaCompanionState}
        joseCompanionState={joseCompanionState}
        hectorCompanionState={hectorCompanionState}
      />
    );
  }

  if (showOnboarding && !settings.selectedModel && !isCoachWindow) {
    return (
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-500 text-sm">Loading...</div>}>
        <OnboardingWizard
          onComplete={(chosenModel: string) => {
            if (chosenModel) setSettings((current: any) => ({ ...current, selectedModel: chosenModel }));
            setShowOnboarding(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div data-alphonso-shell-ready="true" className={`flex h-screen w-full font-sans overflow-hidden selection:bg-cyan-500/30 ${settings.colorScheme === 'light' ? 'light bg-zinc-50 text-zinc-900' : 'bg-[var(--surface-0)] text-[var(--text-1)]'} ${themeClassFromSettings(settings)}`}>
      <UpdaterNotification version={updaterVersion} onUpdate={() => {}} onDismiss={() => setUpdaterVersion(null)} />
      {notificationsOpen && (
        <NotificationCenter
          notifications={notifications}
          onDismiss={dismissNotification}
          onClearAll={clearAllNotifications}
        />
      )}
      <Suspense fallback={null}>
        <CoachHardInterruptOverlay intervention={coachIntervention} pauseUntilMs={coachPauseUntilMs} onAction={handleCoachInterventionAction} />
      </Suspense>
      {approvalPending && (
        <Suspense fallback={null}>
          <ApprovalModal
            label={approvalPending}
            onConfirm={() => {
              sendNativeNotification('Alphonso', `Approved: ${approvalPending}`);
              setApprovalPending(null);
              approvalResolveRef.current?.(true);
            }}
            onCancel={() => {
              sendNativeNotification('Alphonso', `Denied: ${approvalPending}`);
              setApprovalPending(null);
              setApprovalRequiredNotice(true);
              approvalResolveRef.current?.(false);
            }}
          />
        </Suspense>
      )}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={switchTab}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((v: boolean) => !v)}
        conversations={conversations}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        onCreateChat={createNewChat}
        onDeleteChat={deleteChat}
        settings={settings}
        pendingApprovalCount={pendingApprovalCount}
        onOpenCoach={handleToggleCoachMode}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar
          settings={settings}
          ollamaStatus={ollamaStatus}
          selectedModelMissing={selectedModelMissing}
          operatorMode={operatorMode}
          activeTab={activeTab}
          updateAvailable={updateCheckState.available}
          updateVersion={updateCheckState.latestVersion}
          isOnline={isOnline}
          onOpenSettings={() => switchTab('settings')}
          notificationCount={notifications.length}
          onToggleNotifications={() => setNotificationsOpen((v) => !v)}
        />
        <Suspense fallback={null}>
          <CommandRib activeTab={activeTab} setActiveTab={switchTab} settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} operatorMode={operatorMode} />
        </Suspense>
        <OllamaOfflineBanner
          ollamaStatus={ollamaStatus}
          onRetry={runOllamaCheck}
          onOpenRuntimes={() => switchTab('runtimes')}
        />
        <main className="flex-1 overflow-hidden relative bg-[var(--surface-0)]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[500px] bg-cyan-500/4 blur-[120px] rounded-full pointer-events-none" />
          {/* AgentDock moved to RightPanel → Agents tab */}
          <div className="h-full relative z-10">
            <ViewErrorBoundary label={activeTab} key={activeTab}>
              <Suspense fallback={<ViewLoadingState activeTab={activeTab} />}>
                {activeTab === 'mission' && (
                  <MissionControlHome settings={settings} ollamaStatus={ollamaStatus} operatorMode={operatorMode} coachMode={coachMode} coachIntervention={coachIntervention} verificationLogs={verificationLogs} memoryItems={memoryItems} updateCheckState={updateCheckState} onNavigate={switchTab} />
                )}
                {activeTab === 'mission_room' && (
                  <MissionRoom onCreateApprovalRequest={() => setApprovalRequiredNotice(true)} />
                )}
                {activeTab === 'chat' && (
                  <Suspense fallback={<ViewLoadingState label="Chat" />}>
                    <ChatView activeChatId={activeChatId} settings={settings} setConversations={setConversations} ollamaStatus={ollamaStatus} installedModels={installedModels} selectedModelMissing={selectedModelMissing} voice={voice} onGenerationChange={setIsGeneratingResponse} onTaskComplete={() => setLastTaskCompletedAt(Date.now())} onRetryOllama={runOllamaCheck} onJoseExecutionState={(state: string, message: string) => setJoseCompanionState({ state, message })} onOpenSettings={() => switchTab('settings')} onModelChange={(modelName: string) => setSettings((current: any) => ({ ...current, selectedModel: modelName }))} screenObserverLogs={screenObserverLogs} setActiveTab={switchTab} onPendingCountChange={setPendingApprovalCount} />
                  </Suspense>
                )}
                {activeTab === 'miya' && (
                  <MiyaStudio settings={settings} ollamaStatus={ollamaStatus} onStudioStateChange={(state: string, message: string) => setMiyaCompanionState({ state, message })} onPacketCreated={() => { const log = appendVerificationLog({ type: 'miya_handoff_packet_created', source: 'miya-studio', trust: TRUST_STATES.TEMPORARY, payload: { selectedModel: settings.selectedModel || null } }); setVerificationLogs((current: unknown[]) => [...current, log].slice(-VERIFICATION_LOG_CAP)); }} />
                )}
                {activeTab === 'content' && (
                  <ContentCatalystWorkspace settings={settings} onJobChange={(job: any) => { if (!job) return; const log = appendVerificationLog({ type: 'content_catalyst_job_update', source: 'content-catalyst', trust: TRUST_STATES.TEMPORARY, payload: { jobId: job.id, status: job.status, currentStep: job.currentStep } }); setVerificationLogs((current: unknown[]) => [...current, log].slice(-VERIFICATION_LOG_CAP)); }} onApprovalRequest={(approval: any) => { if (!approval) return; const log = appendVerificationLog({ type: 'content_catalyst_publish_approval', source: 'content-catalyst', trust: TRUST_STATES.TEMPORARY, payload: approval }); setVerificationLogs((current: unknown[]) => [...current, log].slice(-VERIFICATION_LOG_CAP)); }} />
                )}
                {activeTab === 'hector' && (
                  <HectorResearchDesk onHectorStateChange={(payload: any) => { if (!payload) return; setHectorCompanionState((current: any) => ({ ...current, ...payload })); }} />
                )}
                {activeTab === 'automation' && <AutomationView />}
                {activeTab === 'files' && <FilesView memoryItems={memoryItems} />}
                {activeTab === 'ecosystem' && (
                  <EcosystemHub settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} verificationLogs={verificationLogs} memoryItems={memoryItems} voiceStatus={voice.voiceStatus} workspaceFoundation={workspaceFoundation} updateCheckState={updateCheckState} nativeSelfDevProof={nativeSelfDevProof} setNativeSelfDevProof={setNativeSelfDevProof} nativeProofHooks={nativeProofHooks} />
                )}
                {activeTab === 'project_execution' && <ProjectExecutionMode />}
                {activeTab === 'orchestrator' && (
                  <OrchestratorView settings={settings} ollamaStatus={ollamaStatus} onJoseStateChange={(state: string, message: string) => setJoseCompanionState({ state, message })} />
                )}
                {activeTab === 'workflows' && (
                  <AutomationView />
                )}
                {activeTab === 'operator' && (
                  <OperatorDashboard operatorMode={operatorMode} setOperatorMode={setOperatorMode} ollamaStatus={ollamaStatus} lastCheckedAt={lastCheckedAt} verificationLogs={verificationLogs} onVerifyOllama={verifyOllamaWithProof} onVerifyAuditChain={verifyAuditChain} onVerifyProcess={verifyProcesses} onVerifyPaths={verifyPaths} onVerifyCommand={verifyCommand} memoryItems={memoryItems} plugins={plugins} diskPluginManifests={diskPluginManifests} pluginAudit={pluginAudit} onTogglePlugin={handleTogglePlugin} onDiscoverPlugins={handleDiscoverPlugins} workspaceFoundation={workspaceFoundation} onToggleWorkspaceFeature={handleToggleWorkspaceFeature} workspaceProof={workspaceProof} ocrCapability={ocrCapability} onRunWorkspaceProof={handleRunWorkspaceProof} onCheckOcrCapability={handleCheckOcrCapability} workspaceSymbolIndex={workspaceSymbolIndex} onBuildSymbolIndex={handleBuildSymbolIndex} onExecutePluginTool={handleExecutePluginTool} onValidatePluginManifest={handleValidatePluginManifest} lastPluginToolRun={lastPluginToolRun} lastManifestValidation={lastManifestValidation} pluginSandboxPolicy={pluginSandboxPolicy} onUpdatePluginSandboxPolicy={handleUpdatePluginSandboxPolicy} auditChainProof={auditChainProof} onRunOcrAdapter={handleRunOcrAdapter} lastOcrAdapterRun={lastOcrAdapterRun} snapshots={snapshots} onCreateSnapshot={handleCreateSnapshot} onRestoreSnapshot={handleRestoreSnapshot} onBackupMemory={handleBackupMemory} onRunRuntimeRepair={handleRuntimeRepair} onRunReleasePreflight={handleRunReleasePreflight} onExportDiagnostics={handleExportDiagnostics} durableAuditLogs={durableAuditLogs} coachMode={coachMode} coachAlwaysOnTop={coachAlwaysOnTop} onToggleCoachMode={handleToggleCoachMode} onToggleCoachTop={handleToggleCoachTop} screenObserverState={screenObserverState} screenObserverLogs={screenObserverLogs} onRequestScreenObserverPermission={handleRequestScreenObserverPermission} onStartScreenObserver={handleStartScreenObserver} onStopScreenObserver={handleStopScreenObserver} onUpdateScreenObserverSettings={handleUpdateScreenObserverSettings} modes={settings} />
                )}
                {activeTab === 'settings' && (
                  <Suspense fallback={null}>
                    <SettingsView settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} installedModels={installedModels} selectedModelMissing={selectedModelMissing} onCheckOllama={runOllamaCheck} onCopyTroubleshootingCommand={copyTroubleshootingCommand} copyState={copyState} updateCheckState={updateCheckState} onCheckUpdates={() => runOllamaCheck()} normalizeEndpoint={(e: string) => e} ollamaTroubleshootingCommand="ollama" braveSearchConfigured={braveSearchConfigured} memoryItems={memoryItems} />
                  </Suspense>
                )}
                {activeTab === 'connectors' && (
                  <div className="h-full overflow-y-auto p-6">
                    <React.Suspense fallback={<div className="flex items-center justify-center h-full text-zinc-500 text-sm">Loading...</div>}>
                      <ConnectorHealthPanel zeroCostMode={settings.zeroCostMode} />
                    </React.Suspense>
                  </div>
                )}
                {activeTab === 'runtimes' && (
                  <React.Suspense fallback={<div className="flex items-center justify-center h-full text-zinc-500 text-sm">Loading runtimes…</div>}>
                    <RuntimeManagerView />
                  </React.Suspense>
                )}
                {activeTab === 'activity' && (
                  <Suspense fallback={null}>
                    <AgentActivityLog />
                  </Suspense>
                )}
              </Suspense>
            </ViewErrorBoundary>
          </div>
        </main>
      </div>
      <Suspense fallback={null}>
        <RightPanel settings={settings} ollamaStatus={ollamaStatus} installedModels={installedModels} desktopBridge={desktopBridge} voiceStatus={voice.voiceStatus} selectedModelMissing={selectedModelMissing} lastCheckedAt={lastCheckedAt} onCheckOllama={runOllamaCheck} onCopyTroubleshootingCommand={copyTroubleshootingCommand} copyState={copyState} onMinimizeToCoach={minimizeToCoach} operatorMode={operatorMode} approvalRequiredNotice={approvalRequiredNotice} miyaCompanionState={miyaCompanionState} joseCompanionState={joseCompanionState} hectorCompanionState={hectorCompanionState} screenObserverState={screenObserverState} updateCheckState={updateCheckState} onCheckUpdates={() => runOllamaCheck()} agentDockCompanions={mergedAgentDockCompanions} />
      </Suspense>
      <Suspense fallback={null}>
        <BootStatusBanner />
      </Suspense>
      {showWorkflowPanel && (
        <Suspense fallback={<ViewLoadingState label="Workflows" />}>
          <WorkflowPanel onClose={() => setShowWorkflowPanel(false)} onRunWorkflow={(_workflowId: string) => switchTab('activity')} />
        </Suspense>
      )}
    </div>
  );
}

function VerificationLogsProvider({ children }: { children: React.ReactNode }) {
  const [verificationLogs, setVerificationLogs] = useState<unknown[]>(() => getVerificationLogs());
  const [durableAuditLogs, setDurableAuditLogs] = useState<unknown[]>([]);
  const [auditChainProof, setAuditChainProof] = useState<unknown>(null);
  const [approvalRequiredNotice, setApprovalRequiredNotice] = useState(false);
  const bridgeValue = React.useMemo<VerificationLogsBridgeValue>(() => ({ verificationLogs, setVerificationLogs, durableAuditLogs, setDurableAuditLogs, auditChainProof, setAuditChainProof, approvalRequiredNotice, setApprovalRequiredNotice }), [verificationLogs, setVerificationLogs, durableAuditLogs, setDurableAuditLogs, auditChainProof, setAuditChainProof, approvalRequiredNotice, setApprovalRequiredNotice]);

  return (
    <VerificationLogsBridge.Provider value={bridgeValue}>
      {children}
    </VerificationLogsBridge.Provider>
  );
}

function RequestApprovalProvider({ children }: { children: React.ReactNode }) {
  const [approvalPending, setApprovalPending] = useState<string | null>(null);
  const approvalResolveRef = useRef<((value: boolean) => void) | null>(null);

  const requestApproval = useCallback((actionLabel: string): Promise<boolean> => {
    return new Promise((resolve) => {
      approvalResolveRef.current = resolve;
      setApprovalPending(actionLabel);
    });
  }, []);

  const approvalValue = React.useMemo<RequestApprovalBridgeValue>(() => ({ approvalPending, setApprovalPending, requestApproval, approvalResolveRef }), [approvalPending, setApprovalPending, requestApproval]);

  return (
    <RequestApprovalBridge.Provider value={approvalValue}>
      {children}
    </RequestApprovalBridge.Provider>
  );
}

export default function App() {
  return (
    <VerificationLogsProvider>
      <RequestApprovalProvider>
        <SettingsProvider>
          <OllamaProviderInner>
            <PluginProviderInner>
              <WorkspaceProviderInner>
                <VerificationProviderInner>
                  <CoachProvider>
                    <AppShell />
                  </CoachProvider>
                </VerificationProviderInner>
              </WorkspaceProviderInner>
            </PluginProviderInner>
          </OllamaProviderInner>
        </SettingsProvider>
      </RequestApprovalProvider>
    </VerificationLogsProvider>
  );
}

const NOOP_MEMORY = () => {};

function OllamaProviderInner({ children }: { children: React.ReactNode }) {
  const bridge = useVerificationLogsBridge()!;
  return (
    <OllamaProvider setVerificationLogs={bridge.setVerificationLogs} setMemoryItems={NOOP_MEMORY}>
      {children}
    </OllamaProvider>
  );
}

function PluginProviderInner({ children }: { children: React.ReactNode }) {
  const bridge = useVerificationLogsBridge()!;
  const approval = useRequestApprovalBridge()!;
  return (
    <PluginProvider requestApproval={approval.requestApproval} setVerificationLogs={bridge.setVerificationLogs} setDurableAuditLogs={bridge.setDurableAuditLogs} setApprovalRequiredNotice={bridge.setApprovalRequiredNotice}>
      {children}
    </PluginProvider>
  );
}

function WorkspaceProviderInner({ children }: { children: React.ReactNode }) {
  const bridge = useVerificationLogsBridge()!;
  const approval = useRequestApprovalBridge()!;
  return (
    <WorkspaceProvider requestApproval={approval.requestApproval} setVerificationLogs={bridge.setVerificationLogs} setDurableAuditLogs={bridge.setDurableAuditLogs}>
      {children}
    </WorkspaceProvider>
  );
}

function VerificationProviderInner({ children }: { children: React.ReactNode }) {
  const bridge = useVerificationLogsBridge()!;
  const approval = useRequestApprovalBridge()!;
  return (
    <VerificationProvider
      requestApproval={approval.requestApproval}
      setApprovalRequiredNotice={bridge.setApprovalRequiredNotice}
      verificationLogs={bridge.verificationLogs}
      setVerificationLogs={bridge.setVerificationLogs}
      durableAuditLogs={bridge.durableAuditLogs}
      setDurableAuditLogs={bridge.setDurableAuditLogs}
      auditChainProof={bridge.auditChainProof}
      setAuditChainProof={bridge.setAuditChainProof}
    >
      {children}
    </VerificationProvider>
  );
}
