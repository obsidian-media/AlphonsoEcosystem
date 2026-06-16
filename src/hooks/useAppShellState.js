import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getStorage } from '../lib/appStorage';
import { INITIAL_CONVERSATION_ID, VERIFICATION_LOG_CAP, SNAPSHOT_HISTORY_CAP, MEMORY_EXPIRY_MS, SCREEN_OBSERVER_INTERVAL_MS } from '../constants/appConstants';
import { listMemoryItems, pushMemoryItem } from '../services/memoryService';
import { listSnapshots, createSnapshot, restoreSnapshotById, backupMemoryLedger } from '../services/recoveryService';
import { appendVerificationLog, getVerificationLogs, readDurableAuditLog } from '../services/verificationService';
import { getScreenObserverLogs, getScreenObserverState, requestScreenNotificationPermission, startScreenObserver, stopScreenObserver, updateScreenObserverState } from '../services/screenIntelligenceService';
import { sendNativeNotification } from '../services/notificationService';
import { listAgentProfiles } from '../agents/agentRegistry';
import { needsHighRiskApproval } from '../lib/chatUtils';
import { TRUST_STATES } from '../services/trustModel';

export function useAppShellState({
  settings, setSettings, operatorMode, setOperatorMode,
  ollamaStatus, desktopBridge, lastCheckedAt, installedModels, selectedModelMissing, runOllamaCheck, copyTroubleshootingCommand, copyState,
  plugins, pluginAudit, pluginSandboxPolicy, diskPluginManifests, lastPluginToolRun, lastManifestValidation, handleTogglePlugin, handleExecutePluginTool, handleValidatePluginManifest, handleDiscoverPlugins, handleUpdatePluginSandboxPolicy,
  workspaceFoundation, workspaceProof, ocrCapability, workspaceSymbolIndex, lastOcrAdapterRun, handleRunWorkspaceProof, handleCheckOcrCapability, handleBuildSymbolIndex, handleRunOcrAdapter, handleToggleWorkspaceFeature,
  verificationLogs, durableAuditLogs, auditChainProof, setVerificationLogs, setDurableAuditLogs, verifyOllamaWithProof, verifyProcesses, verifyPaths, verifyAuditChain, verifyCommand, handleRunReleasePreflight, handleRuntimeRepair,
  coachMode, coachAlwaysOnTop, coachMiniMode, coachSnapCorner, coachIntervention, coachPauseUntilMs, setCoachMode, setCoachMiniMode, setCoachAlwaysOnTop, handleToggleCoachMode, handleToggleCoachTop, handleCoachInterventionAction, minimizeToCoach,
  voice, toast
}) {
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
  const [, startTabTransition] = useTransition();

  const switchTab = useCallback((tab) => startTabTransition(() => setActiveTab(tab)), []);

  const mergedAgentDockCompanions = useMemo(() => {
    // Logic from App.jsx
    const activeStates = {
      alphonso: { state: voice.voiceStatus, message: voice.voiceStatus }, // Simplified for brevity
      hector: hectorCompanionState, jose: joseCompanionState, miya: miyaCompanionState
    };
    return listAgentProfiles().map((agent) => ({
      agentId: agent.id, name: agent.name,
      state: activeStates[agent.id]?.state || 'idle',
      message: activeStates[agent.id]?.message || agent.title || agent.role
    }));
  }, [hectorCompanionState, joseCompanionState, miyaCompanionState, voice.voiceStatus]);

  const writeNativeProofStage = useCallback(async (stageFileName, payload = {}) => {
    // Logic from App.jsx
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

  const requestApproval = useCallback((actionLabel) => {
    // Logic from App.jsx
    if (!settings.approvalMode) return Promise.resolve(true);
    if (!needsHighRiskApproval(actionLabel)) return Promise.resolve(true);
    return new Promise((resolve) => {
      approvalResolveRef.current = resolve;
      setApprovalPending(actionLabel);
    });
  }, [settings.approvalMode]);

  const createNewChat = useCallback(() => {
    // Logic from App.jsx
    const newId = `chat-${Date.now()}`;
    const newChat = { id: newId, title: 'Unsaved Chat', timestamp: Date.now() };
    setConversations((current) => [newChat, ...current]);
    setActiveChatId(newId);
    switchTab('chat');
  }, [setConversations, setActiveChatId, switchTab]);

  const deleteChat = useCallback((id, event) => {
    // Logic from App.jsx
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
    // Logic from App.jsx
    if (!await requestApproval('Create restore point snapshot')) return;
    const snapshot = await createSnapshot({ settings, ollamaStatus, activeChatId, verificationLogCount: verificationLogs.length, memoryCount: memoryItems.length });
    setSnapshots((current) => [...current, snapshot].slice(-SNAPSHOT_HISTORY_CAP));
  }, [requestApproval, settings, ollamaStatus, activeChatId, verificationLogs.length, memoryItems.length]);

  const handleRestoreSnapshot = useCallback(async (snapshotId) => {
    // Logic from App.jsx
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
    // Logic from App.jsx
    if (!await requestApproval('Create memory backup')) return;
    const backup = backupMemoryLedger(memoryItems);
    const log = appendVerificationLog({ type: 'memory_backup', source: 'local-recovery', trust: TRUST_STATES.VERIFIED, payload: { backupId: backup.id, count: backup.items.length } });
    setVerificationLogs((current) => [...current, log].slice(-VERIFICATION_LOG_CAP));
  }, [requestApproval, memoryItems, setVerificationLogs]);

  const handleRequestScreenObserverPermission = useCallback(async () => {
    // Logic from App.jsx
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
    // Logic from App.jsx
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
    // Logic from App.jsx
    const next = stopScreenObserver();
    screenObserverRunRef.current = false;
    setScreenObserverState(next);
    setScreenObserverLogs(getScreenObserverLogs());
  }, []);

  const handleUpdateScreenObserverSettings = useCallback((patch) => {
    // Logic from App.jsx
    const next = updateScreenObserverState(patch);
    setScreenObserverState(next);
  }, []);

  const handleExportDiagnostics = useCallback(() => {
    // Logic from App.jsx
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

  return {
    activeTab, setActiveTab,
    isSidebarOpen, setIsSidebarOpen,
    conversations, setConversations,
    activeChatId, setActiveChatId,
    isGeneratingResponse, setIsGeneratingResponse,
    lastTaskCompletedAt, setLastTaskCompletedAt,
    isOnline, setIsOnline,
    isLocked, setIsLocked,
    idleTimerRef,
    memoryItems, setMemoryItems,
    screenObserverState, setScreenObserverState,
    screenObserverLogs, setScreenObserverLogs,
    miyaCompanionState, setMiyaCompanionState,
    joseCompanionState, setJoseCompanionState,
    hectorCompanionState, setHectorCompanionState,
    snapshots, setSnapshots,
    showWorkflowPanel, setShowWorkflowPanel,
    approvalRequiredNotice, setApprovalRequiredNotice,
    approvalPending, setApprovalPending,
    showOnboarding, setShowOnboarding,
    nativeSelfDevProof, setNativeSelfDevProof,
    updateCheckState, setUpdateCheckState,
    braveSearchConfigured, setBraveSearchConfigured,
    approvalResolveRef,
    screenObserverRunRef,
    workspaceRootBootstrapRef,
    nativeSelfDevAutorunRef,
    prevOllamaStateRef,
    switchTab,
    mergedAgentDockCompanions,
    writeNativeProofStage,
    nativeProofHooks,
    requestApproval,
    createNewChat,
    deleteChat,
    handleCreateSnapshot,
    handleRestoreSnapshot,
    handleBackupMemory,
    handleRequestScreenObserverPermission,
    handleStartScreenObserver,
    handleStopScreenObserver,
    handleUpdateScreenObserverSettings,
    handleExportDiagnostics
  };
}