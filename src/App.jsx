import React, { Suspense, lazy, useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useVoiceInput } from './hooks/useVoiceInput';
import { listMemoryItems, pushMemoryItem } from './services/memoryService';
import { listSnapshots, createSnapshot, restoreSnapshotById, backupMemoryLedger } from './services/recoveryService';
import { TRUST_STATES } from './services/trustModel';
import { appendVerificationLog, getVerificationLogs, readDurableAuditLog } from './services/verificationService';
import { updateWorkspaceFoundation } from './services/workspaceIntelligenceService';
import {
  getScreenObserverLogs,
  getScreenObserverState,
  requestScreenNotificationPermission,
  startScreenObserver,
  stopScreenObserver,
  updateScreenObserverState
} from './services/screenIntelligenceService';
import { sendNativeNotification } from './services/notificationService';
import { listAgentProfiles } from './agents/agentRegistry';
import { needsHighRiskApproval } from './lib/chatUtils';
import { getStorage } from './lib/appStorage';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { useToast } from './components/ToastProvider';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CoachWindow } from './components/CoachWindow';
import { ViewLoadingState } from './components/ViewLoadingState';
import { useAppKeyboardShortcuts } from './hooks/useAppKeyboardShortcuts';
import { useIdleLock } from './hooks/useIdleLock';
import { useAppEffects } from './hooks/useAppEffects';
import {
  INITIAL_CONVERSATION_ID,
  VERIFICATION_LOG_CAP,
  AUDIT_LOG_FETCH_LIMIT,
  SNAPSHOT_HISTORY_CAP,
  SCREEN_OBSERVER_INTERVAL_MS,
  MEMORY_EXPIRY_MS,
  themeClassFromSettings,
  getCompanionState,
  companionStateFromVoice,
  coachMessageFromVoice
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
const MicrophoneStatus = lazy(() => import('./components/MicrophoneStatus').then((mod) => ({ default: mod.MicrophoneStatus })));
const SettingsView = lazy(() => import('./components/SettingsView').then((mod) => ({ default: mod.SettingsView })));
const RightPanel = lazy(() => import('./components/RightPanel').then((mod) => ({ default: mod.RightPanel })));
const AgentActivityLog = lazy(() => import('./components/AgentActivityLog').then((mod) => ({ default: mod.AgentActivityLog })));

const parsedSearchParams = new URLSearchParams(window.location.search);
const IS_COACH_WINDOW = parsedSearchParams.get('coach') === '1';
const COACH_AGENT_FROM_QUERY = parsedSearchParams.get('coachAgent');

function AppShell() {
  const isCoachWindow = IS_COACH_WINDOW;
  const coachAgentFromQuery = COACH_AGENT_FROM_QUERY;
  const { settings, setSettings, operatorMode, setOperatorMode } = useSettings();
  const { ollamaStatus, desktopBridge, lastCheckedAt, installedModels, selectedModelMissing, runOllamaCheck, copyTroubleshootingCommand, copyState, ollamaCheckRunRef } = useOllama();
  const { plugins, pluginAudit, pluginSandboxPolicy, diskPluginManifests, lastPluginToolRun, lastManifestValidation, handleTogglePlugin, handleExecutePluginTool, handleValidatePluginManifest, handleDiscoverPlugins, handleUpdatePluginSandboxPolicy } = usePlugins();
  const { workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastOcrAdapterRun, handleRunWorkspaceProof, handleCheckOcrCapability, handleBuildSymbolIndex, handleRunOcrAdapter, handleToggleWorkspaceFeature } = useWorkspace();
  const { verificationLogs, durableAuditLogs, auditChainProof, setVerificationLogs, setDurableAuditLogs, verifyOllamaWithProof, verifyProcesses, verifyPaths, verifyAuditChain, verifyCommand, handleRunReleasePreflight, handleRuntimeRepair } = useVerification();
  const { coachMode, coachAlwaysOnTop, coachMiniMode, coachSnapCorner, coachIntervention, coachPauseUntilMs, setCoachMode, setCoachMiniMode, setCoachAlwaysOnTop, handleToggleCoachMode, handleToggleCoachTop, handleCoachInterventionAction, minimizeToCoach } = useCoach();

  const [activeTab, setActiveTab] = useState('mission');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState(() => getStorage('alphonso_conversations', [
    { id: INITIAL_CONVERSATION_ID, title: 'New Chat Session', timestamp: Date.now() }
  ]));
  const [activeChatId, setActiveChatId] = useState(conversations[0]?.id || INITIAL_CONVERSATION_ID);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [lastTaskCompletedAt, setLastTaskCompletedAt] = useState(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isLocked, setIsLocked] = useState(false);
  const idleTimerRef = useRef(null);
  const [memoryItems, setMemoryItems] = useState(() => listMemoryItems());
  const [screenObserverState, setScreenObserverState] = useState(() => getScreenObserverState());
  const [screenObserverLogs, setScreenObserverLogs] = useState(() => getScreenObserverLogs());
  const [miyaCompanionState, setMiyaCompanionState] = useState({ state: 'idle', message: 'Miya is ready.' });
  const [joseCompanionState, setJoseCompanionState] = useState({ state: 'idle', message: 'Jose is coordinating quietly.' });
  const [hectorCompanionState, setHectorCompanionState] = useState({ state: 'idle', message: 'Hector is standing by.', currentSourceUrl: null, lastRunSummary: '' });
  const [snapshots, setSnapshots] = useState(() => listSnapshots());
  const [showWorkflowPanel, setShowWorkflowPanel] = useState(false);
  const [approvalRequiredNotice, setApprovalRequiredNotice] = useState(false);
  const [approvalPending, setApprovalPending] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !getStorage('alphonso_onboarding_complete_v1', false));
  const [nativeSelfDevProof, setNativeSelfDevProof] = useState(() => {
    const stored = getStorage('alphonso_native_selfdev_proof', null);
    return stored && typeof stored === 'object' ? stored : null;
  });
  const [updateCheckState, setUpdateCheckState] = useState({
    checking: false, configured: false, available: false, latestVersion: null,
    currentVersion: '', notes: null, pubDate: null, downloadUrl: null,
    checkedAtMs: null, trust: TRUST_STATES.UNVERIFIED, error: null, notificationSent: false
  });
  const [braveSearchConfigured, setBraveSearchConfigured] = useState(false);

  const approvalResolveRef = useRef(null);
  const screenObserverRunRef = useRef(false);
  const workspaceRootBootstrapRef = useRef(false);
  const nativeSelfDevAutorunRef = useRef(false);
  const prevOllamaStateRef = useRef(null);
  const voice = useVoiceInput();
  const toast = useToast();
  const [, startTabTransition] = useTransition();
  const switchTab = useCallback((tab) => startTabTransition(() => setActiveTab(tab)), []);

  const mergedAgentDockCompanions = useMemo(() => {
    const activeStates = {
      alphonso: { state: companionStateFromVoice(voice.voiceStatus), message: coachMessageFromVoice(voice.voiceStatus) },
      hector: hectorCompanionState, jose: joseCompanionState, miya: miyaCompanionState
    };
    return listAgentProfiles().map((agent) => ({
      agentId: agent.id, name: agent.name,
      state: activeStates[agent.id]?.state || 'idle',
      message: activeStates[agent.id]?.message || agent.title || agent.role
    }));
  }, [hectorCompanionState, joseCompanionState, miyaCompanionState, voice.voiceStatus]);

  const writeNativeProofStage = useCallback(async (stageFileName, payload = {}) => {
    const proofWorkspaceRoot = String(payload.workspaceRoot || settings.workspaceRoot || '').trim();
    if (!proofWorkspaceRoot) return null;
    const stage = String(stageFileName || '').replace(/\.json$/i, '');
    const content = {
      timestamp: new Date().toISOString(), stage, status: payload.status || 'recorded',
      processId: payload.processId ?? null, workspaceRoot: proofWorkspaceRoot,
      error: payload.error ?? null, durationMs: payload.durationMs ?? null, ...payload
    };
    try {
      void invoke('alphonso-native-proof-stage', { fileName: stageFileName, ...content }).catch(() => {});
      void invoke('write_workspace_text_file', {
        workspaceRoot: proofWorkspaceRoot, relativePath: `release/rc0/proof/${stageFileName}`,
        content: JSON.stringify(content, null, 2)
      }).catch(() => {});
      return content;
    } catch { return null; }
  }, [settings.workspaceRoot]);

  const nativeProofHooks = useMemo(() => ({ writeStage: writeNativeProofStage }), [writeNativeProofStage]);

  const companion = getCompanionState({
    ollamaStatus, voiceStatus: voice.voiceStatus, isGeneratingResponse,
    lastTaskCompletedAt, selectedModelMissing,
    privacyModeActive: settings.privacyShieldActive, approvalModeActive: settings.approvalMode,
    approvalRequiredNotice
  });

  const requestApproval = useCallback((actionLabel) => {
    if (!settings.approvalMode) return Promise.resolve(true);
    if (!needsHighRiskApproval(actionLabel)) return Promise.resolve(true);
    return new Promise((resolve) => {
      approvalResolveRef.current = resolve;
      setApprovalPending(actionLabel);
    });
  }, [settings.approvalMode]);

  const createNewChat = useCallback(() => {
    const newId = `chat-${Date.now()}`;
    const newChat = { id: newId, title: 'Unsaved Chat', timestamp: Date.now() };
    setConversations((current) => [newChat, ...current]);
    setActiveChatId(newId);
    switchTab('chat');
  }, [setConversations, setActiveChatId, switchTab]);

  useAppKeyboardShortcuts({ approvalPending, setApprovalPending, setApprovalRequiredNotice, approvalResolveRef, switchTab });
  useIdleLock({ idleTimeoutMinutes: settings.idleTimeoutMinutes, setIsLocked, idleTimerRef });

  useAppEffects({
    settings, setSettings, conversations, setConversations, activeChatId, setActiveChatId,
    activeTab, ollamaStatus, desktopBridge, setDesktopBridge: () => {},
    coachMode, setCoachMode, coachMiniMode, setCoachMiniMode, coachAlwaysOnTop, coachSnapCorner,
    setIsLocked, setIsOnline, isCoachWindow, verificationLogs, setVerificationLogs,
    nativeSelfDevProof, setNativeSelfDevProof, workspaceFoundation, setWorkspaceFoundation: () => {},
    updateCheckState, setUpdateCheckState, setLastCheckedAt: () => {},
    joseCompanionState, setJoseCompanionState, hectorCompanionState, setHectorCompanionState,
    approvalRequiredNotice, setApprovalRequiredNotice, approvalPending, setApprovalPending,
    setBraveSearchConfigured, setDurableAuditLogs, setDiskPluginManifests: () => {},
    setMemoryItems, setPlugins: () => {}, setPluginAudit: () => {},
    setScreenObserverState, setScreenObserverLogs, setCoachIntervention: () => {},
    setLastTaskCompletedAt, operatorMode, voice, toast, writeNativeProofStage, nativeProofHooks,
    runOllamaCheck, createNewChat, switchTab, approvalResolveRef, idleTimerRef,
    ollamaCheckRunRef, screenObserverRunRef, workspaceRootBootstrapRef, nativeSelfDevAutorunRef,
    prevOllamaStateRef
  });

  const deleteChat = useCallback((id, event) => {
    event.stopPropagation();
    const filtered = conversations.filter((conversation) => conversation.id !== id);
    if (filtered.length === 0) {
      const resetId = INITIAL_CONVERSATION_ID;
      setConversations([{ id: resetId, title: 'New Chat Session', timestamp: Date.now() }]);
      setActiveChatId(resetId);
    } else {
      setConversations(filtered);
      if (activeChatId === id) setActiveChatId(filtered[0].id);
    }
    localStorage.removeItem(`alphonso_messages_${id}`);
  }, [conversations, activeChatId]);

  const handleCreateSnapshot = useCallback(async () => {
    if (!await requestApproval('Create restore point snapshot')) return;
    const snapshot = await createSnapshot({ settings, ollamaStatus, activeChatId, verificationLogCount: verificationLogs.length, memoryCount: memoryItems.length });
    setSnapshots((current) => [...current, snapshot].slice(-SNAPSHOT_HISTORY_CAP));
  }, [requestApproval, settings, ollamaStatus, activeChatId, verificationLogs.length, memoryItems.length]);

  const handleRestoreSnapshot = useCallback(async (snapshotId) => {
    if (!await requestApproval(`Restore snapshot: ${snapshotId}`)) return;
    const payload = restoreSnapshotById(snapshotId);
    if (!payload) return;
    if (payload.settings) setSettings(payload.settings);
    if (payload.activeChatId) setActiveChatId(payload.activeChatId);
    if (payload.ollamaStatus) {
      const proof = appendVerificationLog({ type: 'restore_snapshot', source: 'local-recovery', trust: TRUST_STATES.VERIFIED, payload: { snapshotId } });
      setVerificationLogs((current) => [...current, proof].slice(-VERIFICATION_LOG_CAP));
    }
    setLastTaskCompletedAt(Date.now());
  }, [requestApproval, setSettings, setActiveChatId, setVerificationLogs]);

  const handleBackupMemory = useCallback(async () => {
    if (!await requestApproval('Create memory backup')) return;
    const backup = backupMemoryLedger(memoryItems);
    const log = appendVerificationLog({ type: 'memory_backup', source: 'local-recovery', trust: TRUST_STATES.VERIFIED, payload: { backupId: backup.id, count: backup.items.length } });
    setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
  }, [requestApproval, memoryItems, setVerificationLogs]);

  const handleRequestScreenObserverPermission = useCallback(async () => {
    if (!await requestApproval('Request desktop notification permission for screen alerts')) return;
    const permission = await requestScreenNotificationPermission();
    const next = updateScreenObserverState({
      currentSummary: permission === 'granted' ? 'Notification permission granted.'
        : permission === 'unsupported' ? 'Notifications are unsupported in this runtime.'
          : 'Notification permission not granted.'
    });
    setScreenObserverState(next);
  }, [requestApproval]);

  const handleStartScreenObserver = useCallback(async () => {
    if (!await requestApproval('Start visible screen observer (manual permission prompt)')) return;
    const current = getScreenObserverState();
    const result = await startScreenObserver({
      sampleEveryMs: current.sampleEveryMs || SCREEN_OBSERVER_INTERVAL_MS,
      notificationsEnabled: current.notificationsEnabled !== false,
      audioAlertEnabled: current.audioAlertEnabled === true,
      onUpdate: (nextState, event) => {
        setScreenObserverState(nextState);
        if (event) {
          setScreenObserverLogs(getScreenObserverLogs());
          pushMemoryItem({
            title: `Screen observer: ${event.status}`, category: 'workspace_memory',
            content: `${event.summary} (change ${event.changeLevel})`, source: 'screen-observer',
            sourceAgent: 'alphonso', confidence: TRUST_STATES.INFERRED,
            verificationState: TRUST_STATES.INFERRED,
            expiresAt: Date.now() + MEMORY_EXPIRY_MS, expiryRule: 'visual_pattern_7d'
          });
          if (event.status === 'high_change_detected' || event.status === 'pattern_repeated') {
            setHectorCompanionState({ state: 'warning', message: event.summary, currentSourceUrl: null, lastRunSummary: event.summary });
          }
        }
      }
    });
    screenObserverRunRef.current = Boolean(result?.ok);
    if (result?.ok) {
      setScreenObserverLogs(getScreenObserverLogs());
    }
  }, [requestApproval, setHectorCompanionState]);

  const handleStopScreenObserver = useCallback(() => {
    const next = stopScreenObserver();
    screenObserverRunRef.current = false;
    setScreenObserverState(next);
    setScreenObserverLogs(getScreenObserverLogs());
  }, []);

  const handleUpdateScreenObserverSettings = useCallback((patch) => {
    const next = updateScreenObserverState(patch);
    setScreenObserverState(next);
  }, []);

  const handleExportDiagnostics = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      modes: { operatorMode, localOnlyMode: settings.localOnlyMode, zeroCostMode: settings.zeroCostMode, approvalMode: settings.approvalMode, safeMode: settings.safeMode, privacyShieldActive: settings.privacyShieldActive },
      runtime: { ollamaStatus, desktopBridge, selectedModel: settings.selectedModel, endpoint: settings.endpoint, lastCheckedAt: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : null },
      counts: { verificationLogs: verificationLogs.length, memoryItems: memoryItems.length, plugins: plugins.length, snapshots: snapshots.length },
      verificationLogs, durableAuditLogs, memoryItems, plugins, diskPluginManifests, pluginAudit, snapshots,
      workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex,
      lastPluginToolRun, lastManifestValidation, lastOcrAdapterRun, auditChainProof, pluginSandboxPolicy
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alphonso-diagnostics-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    const log = appendVerificationLog({ type: 'diagnostics_export', source: 'operator-dashboard', trust: TRUST_STATES.VERIFIED, payload: { bytes: blob.size } });
    setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
  }, [operatorMode, settings, ollamaStatus, desktopBridge, lastCheckedAt, verificationLogs, memoryItems, plugins, snapshots, durableAuditLogs, diskPluginManifests, pluginAudit, workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastPluginToolRun, lastManifestValidation, lastOcrAdapterRun, auditChainProof, pluginSandboxPolicy, setVerificationLogs]);

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
          onComplete={(chosenModel) => {
            if (chosenModel) setSettings((current) => ({ ...current, selectedModel: chosenModel }));
            setShowOnboarding(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div data-alphonso-shell-ready="true" className={`flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-indigo-500/30 ${themeClassFromSettings(settings)}`}>
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
        onToggle={() => setIsSidebarOpen((v) => !v)}
        conversations={conversations}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        onCreateChat={createNewChat}
        onDeleteChat={deleteChat}
        settings={settings}
      />
      <div className="flex flex-col flex-1 relative min-w-0 border-x border-white/[0.05]">
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
        />
        <Suspense fallback={null}>
          <CommandRib activeTab={activeTab} setActiveTab={switchTab} settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} operatorMode={operatorMode} />
        </Suspense>
        <main className="flex-1 overflow-y-auto relative bg-zinc-950/50">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[500px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute left-4 top-4 z-20">
            <Suspense fallback={<div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3 text-xs text-zinc-400">Loading agent dock...</div>}>
              <AgentDock companions={mergedAgentDockCompanions} />
            </Suspense>
          </div>
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
                    <ChatView activeChatId={activeChatId} settings={settings} setConversations={setConversations} ollamaStatus={ollamaStatus} installedModels={installedModels} selectedModelMissing={selectedModelMissing} voice={voice} onGenerationChange={setIsGeneratingResponse} onTaskComplete={() => setLastTaskCompletedAt(Date.now())} onRetryOllama={runOllamaCheck} onJoseExecutionState={(state, message) => setJoseCompanionState({ state, message })} onOpenSettings={() => switchTab('settings')} onModelChange={(modelName) => setSettings((current) => ({ ...current, selectedModel: modelName }))} />
                  </Suspense>
                )}
                {activeTab === 'miya' && (
                  <MiyaStudio settings={settings} ollamaStatus={ollamaStatus} onStudioStateChange={(state, message) => setMiyaCompanionState({ state, message })} onPacketCreated={() => { const log = appendVerificationLog({ type: 'miya_handoff_packet_created', source: 'miya-studio', trust: TRUST_STATES.TEMPORARY, payload: { selectedModel: settings.selectedModel || null } }); setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP)); }} />
                )}
                {activeTab === 'content' && (
                  <ContentCatalystWorkspace settings={settings} onJobChange={(job) => { if (!job) return; const log = appendVerificationLog({ type: 'content_catalyst_job_update', source: 'content-catalyst', trust: TRUST_STATES.TEMPORARY, payload: { jobId: job.id, status: job.status, currentStep: job.currentStep } }); setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP)); }} onApprovalRequest={(approval) => { if (!approval) return; const log = appendVerificationLog({ type: 'content_catalyst_publish_approval', source: 'content-catalyst', trust: TRUST_STATES.TEMPORARY, payload: approval }); setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP)); }} />
                )}
                {activeTab === 'hector' && (
                  <HectorResearchDesk onHectorStateChange={(payload) => { if (!payload) return; setHectorCompanionState((current) => ({ ...current, ...payload })); }} />
                )}
                {activeTab === 'automation' && <AutomationView />}
                {activeTab === 'files' && <FilesView memoryItems={memoryItems} />}
                {activeTab === 'ecosystem' && (
                  <EcosystemHub settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} verificationLogs={verificationLogs} memoryItems={memoryItems} voiceStatus={voice.voiceStatus} workspaceFoundation={workspaceFoundation} updateCheckState={updateCheckState} nativeSelfDevProof={nativeSelfDevProof} setNativeSelfDevProof={setNativeSelfDevProof} nativeProofHooks={nativeProofHooks} />
                )}
                {activeTab === 'project_execution' && <ProjectExecutionMode />}
                {activeTab === 'orchestrator' && (
                  <OrchestratorView settings={settings} ollamaStatus={ollamaStatus} onJoseStateChange={(state, message) => setJoseCompanionState({ state, message })} />
                )}
                {activeTab === 'workflows' && (
                  <AutomationView />
                )}
                {activeTab === 'operator' && (
                  <OperatorDashboard operatorMode={operatorMode} setOperatorMode={setOperatorMode} ollamaStatus={ollamaStatus} lastCheckedAt={lastCheckedAt} verificationLogs={verificationLogs} onVerifyOllama={verifyOllamaWithProof} onVerifyAuditChain={verifyAuditChain} onVerifyProcess={verifyProcesses} onVerifyPaths={verifyPaths} onVerifyCommand={verifyCommand} memoryItems={memoryItems} plugins={plugins} diskPluginManifests={diskPluginManifests} pluginAudit={pluginAudit} onTogglePlugin={handleTogglePlugin} onDiscoverPlugins={handleDiscoverPlugins} workspaceFoundation={workspaceFoundation} onToggleWorkspaceFeature={handleToggleWorkspaceFeature} workspaceProof={workspaceProof} ocrCapability={ocrCapability} onRunWorkspaceProof={handleRunWorkspaceProof} onCheckOcrCapability={handleCheckOcrCapability} workspaceSymbolIndex={workspaceSymbolIndex} onBuildSymbolIndex={handleBuildSymbolIndex} onExecutePluginTool={handleExecutePluginTool} onValidatePluginManifest={handleValidatePluginManifest} lastPluginToolRun={lastPluginToolRun} lastManifestValidation={lastManifestValidation} pluginSandboxPolicy={pluginSandboxPolicy} onUpdatePluginSandboxPolicy={handleUpdatePluginSandboxPolicy} auditChainProof={auditChainProof} onRunOcrAdapter={handleRunOcrAdapter} lastOcrAdapterRun={lastOcrAdapterRun} snapshots={snapshots} onCreateSnapshot={handleCreateSnapshot} onRestoreSnapshot={handleRestoreSnapshot} onBackupMemory={handleBackupMemory} onRunRuntimeRepair={handleRuntimeRepair} onRunReleasePreflight={handleRunReleasePreflight} onExportDiagnostics={handleExportDiagnostics} durableAuditLogs={durableAuditLogs} coachMode={coachMode} coachAlwaysOnTop={coachAlwaysOnTop} onToggleCoachMode={handleToggleCoachMode} onToggleCoachTop={handleToggleCoachTop} screenObserverState={screenObserverState} screenObserverLogs={screenObserverLogs} onRequestScreenObserverPermission={handleRequestScreenObserverPermission} onStartScreenObserver={handleStartScreenObserver} onStopScreenObserver={handleStopScreenObserver} onUpdateScreenObserverSettings={handleUpdateScreenObserverSettings} modes={settings} />
                )}
                {activeTab === 'settings' && (
                  <Suspense fallback={null}>
                    <SettingsView settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} installedModels={installedModels} selectedModelMissing={selectedModelMissing} onCheckOllama={runOllamaCheck} onCopyTroubleshootingCommand={copyTroubleshootingCommand} copyState={copyState} updateCheckState={updateCheckState} onCheckUpdates={() => runOllamaCheck()} normalizeEndpoint={(e) => e} ollamaTroubleshootingCommand="ollama" braveSearchConfigured={braveSearchConfigured} />
                  </Suspense>
                )}
                {activeTab === 'connectors' && (
                  <div className="p-6">
                    <React.Suspense fallback={<div className="flex items-center justify-center h-full text-zinc-500 text-sm">Loading...</div>}>
                      <ConnectorHealthPanel zeroCostMode={settings.zeroCostMode} />
                    </React.Suspense>
                  </div>
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
        <RightPanel settings={settings} ollamaStatus={ollamaStatus} installedModels={installedModels} desktopBridge={desktopBridge} voiceStatus={voice.voiceStatus} selectedModelMissing={selectedModelMissing} lastCheckedAt={lastCheckedAt} onCheckOllama={runOllamaCheck} onCopyTroubleshootingCommand={copyTroubleshootingCommand} copyState={copyState} onMinimizeToCoach={minimizeToCoach} operatorMode={operatorMode} approvalRequiredNotice={approvalRequiredNotice} miyaCompanionState={miyaCompanionState} joseCompanionState={joseCompanionState} hectorCompanionState={hectorCompanionState} screenObserverState={screenObserverState} updateCheckState={updateCheckState} onCheckUpdates={() => runOllamaCheck()} />
      </Suspense>
      {showWorkflowPanel && (
        <Suspense fallback={<ViewLoadingState label="Workflows" />}>
          <WorkflowPanel onClose={() => setShowWorkflowPanel(false)} onRunWorkflow={(workflowId) => switchTab('activity')} />
        </Suspense>
      )}
    </div>
  );
}

function VerificationLogsProvider({ children }) {
  const [verificationLogs, setVerificationLogs] = useState(() => getVerificationLogs());
  const [durableAuditLogs, setDurableAuditLogs] = useState([]);
  const [auditChainProof, setAuditChainProof] = useState(null);
  const [approvalRequiredNotice, setApprovalRequiredNotice] = useState(false);

  return (
    <VerificationLogsBridge value={{ verificationLogs, setVerificationLogs, durableAuditLogs, setDurableAuditLogs, auditChainProof, setAuditChainProof, approvalRequiredNotice, setApprovalRequiredNotice }}>
      {children}
    </VerificationLogsBridge>
  );
}

const VerificationLogsBridge = React.createContext(null);
export function useVerificationLogsBridge() { return React.useContext(VerificationLogsBridge); }

function RequestApprovalProvider({ children }) {
  const [approvalPending, setApprovalPending] = useState(null);
  const approvalResolveRef = useRef(null);

  const requestApproval = useCallback((actionLabel) => {
    return new Promise((resolve) => {
      approvalResolveRef.current = resolve;
      setApprovalPending(actionLabel);
    });
  }, []);

  return (
    <RequestApprovalBridge value={{ approvalPending, setApprovalPending, requestApproval, approvalResolveRef }}>
      {children}
    </RequestApprovalBridge>
  );
}

const RequestApprovalBridge = React.createContext(null);
export function useRequestApprovalBridge() { return React.useContext(RequestApprovalBridge); }

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

function OllamaProviderInner({ children }) {
  const bridge = useVerificationLogsBridge();
  const approval = useRequestApprovalBridge();
  return (
    <OllamaProvider setVerificationLogs={bridge.setVerificationLogs} setMemoryItems={() => {}}>
      {children}
    </OllamaProvider>
  );
}

function PluginProviderInner({ children }) {
  const bridge = useVerificationLogsBridge();
  const approval = useRequestApprovalBridge();
  return (
    <PluginProvider requestApproval={approval.requestApproval} setVerificationLogs={bridge.setVerificationLogs} setDurableAuditLogs={bridge.setDurableAuditLogs} setApprovalRequiredNotice={bridge.setApprovalRequiredNotice}>
      {children}
    </PluginProvider>
  );
}

function WorkspaceProviderInner({ children }) {
  const bridge = useVerificationLogsBridge();
  const approval = useRequestApprovalBridge();
  return (
    <WorkspaceProvider requestApproval={approval.requestApproval} setVerificationLogs={bridge.setVerificationLogs} setDurableAuditLogs={bridge.setDurableAuditLogs}>
      {children}
    </WorkspaceProvider>
  );
}

function VerificationProviderInner({ children }) {
  const bridge = useVerificationLogsBridge();
  const approval = useRequestApprovalBridge();
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
