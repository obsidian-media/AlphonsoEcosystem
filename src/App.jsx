import React, { Suspense, lazy, useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { Mic } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useVoiceInput } from './hooks/useVoiceInput';
import { openCoachWindow, closeCoachWindow } from './services/coachModeService';
import { listCoachSkills } from './services/coachSkillService';
import {
  COACH_INTERVENTION_LEVELS,
  buildDemoSlotIntervention,
  getLatestSessionGuardBridgeIntervention,
  recordCoachInterventionAction
} from './services/coachInterventionService';
import { listMemoryItems, pushMemoryItem } from './services/memoryService';
import { appendPluginAuditEntry, discoverDiskPluginManifests, executePluginToolRun, listPluginAudit, listPlugins, togglePlugin, validatePluginManifestDisk } from './services/pluginRegistryService';
import { listSnapshots, createSnapshot, restoreSnapshotById, backupMemoryLedger } from './services/recoveryService';
import { TRUST_STATES, timestampMs } from './services/trustModel';
import { appendVerificationLog, getVerificationLogs, readDurableAuditLog, verifyCommandExecution, verifyDurableAuditChain, verifyOllamaRuntimeProof, verifyPathProof, verifyProcessProof } from './services/verificationService';
import { buildWorkspaceSymbolIndex, checkOcrCapability, collectWorkspaceProof, getWorkspaceFoundation, runOcrAdapter, updateWorkspaceFoundation } from './services/workspaceIntelligenceService';
import { evaluatePluginExecutionPolicy, getPluginSandboxPolicy, updatePluginSandboxPolicy } from './services/pluginSandboxService';
import {
  getScreenObserverLogs,
  getScreenObserverState,
  requestScreenNotificationPermission,
  startScreenObserver,
  stopScreenObserver,
  updateScreenObserverState
} from './services/screenIntelligenceService';
import { sendNativeNotification } from './services/notificationService';
import { isConnectorAuthenticated } from './services/connectorRegistryService';
import { getDefaultWorkspaceRoot } from './services/workspaceRootService';
import { listAgentProfiles } from './agents/agentRegistry';
import { OLLAMA_TROUBLESHOOTING_COMMAND, normalizeEndpoint } from './lib/ollama';
import { needsHighRiskApproval } from './lib/chatUtils';
import { getStorage, setStorage } from './lib/appStorage';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { useToast } from './components/ToastProvider';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChatView } from './components/ChatView';
import { WorkflowPanel } from './components/WorkflowPanel';
import { CoachMissionBadge } from './components/CoachMissionBadge';
import { CoachInterventionCard } from './components/CoachInterventionCard';
import { CoachHardInterruptOverlay } from './components/CoachHardInterruptOverlay';
import { CoachSkillGrid } from './components/CoachSkillGrid';
import { ViewLoadingState } from './components/ViewLoadingState';
import { useAppKeyboardShortcuts } from './hooks/useAppKeyboardShortcuts';
import { useIdleLock } from './hooks/useIdleLock';
import { useOllamaHealth } from './hooks/useOllamaHealth';
import { useAppEffects } from './hooks/useAppEffects';
import {
  INITIAL_CONVERSATION_ID,
  COACH_LAYOUT_KEY,
  COACH_CORNERS,
  themeClassFromSettings,
  getCompanionState,
  companionStateFromVoice,
  coachMessageFromVoice,
  nextCoachCorner
} from './constants/appConstants';

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

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isCoachWindow = searchParams.get('coach') === '1';
  const coachAgentFromQuery = searchParams.get('coachAgent');
  const [activeTab, setActiveTab] = useState('mission');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [settings, setSettings] = useState(() => getStorage('alphonso_settings', {
    endpoint: 'http://localhost:11434',
    selectedModel: '',
    workspaceRoot: getDefaultWorkspaceRoot(),
    ocrEnginePath: '',
    miyaCompanionPinned: true,
    joseCompanionPinned: true,
    hectorCompanionPinned: true,
    focusMode: 'mission_control',
    environmentTheme: 'minimal_runtime',
    desktopMode: true,
    localOnlyMode: true,
    zeroCostMode: true,
    approvalMode: true,
    safeMode: true,
    privacyShieldActive: false,
    autoScroll: true,
    coachAgent: 'alphonso',
    autoUpdateEnabled: true,
    updaterEndpoint: '',
    updaterPubkey: '',
    updaterTarget: ''
  }));
  const [conversations, setConversations] = useState(() => getStorage('alphonso_conversations', [
    { id: INITIAL_CONVERSATION_ID, title: 'New Chat Session', timestamp: Date.now() }
  ]));
  const [activeChatId, setActiveChatId] = useState(conversations[0]?.id || INITIAL_CONVERSATION_ID);
  const [ollamaStatus, setOllamaStatus] = useState({
    state: 'connecting',
    label: 'Connecting',
    message: 'Checking Ollama...',
    models: [],
    trust: TRUST_STATES.TEMPORARY
  });
  const [desktopBridge, setDesktopBridge] = useState({
    state: 'checking',
    label: 'Checking',
    message: 'Checking Tauri runtime bridge...'
  });
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [copyState, setCopyState] = useState('idle');
  const [updateCheckState, setUpdateCheckState] = useState({
    checking: false,
    configured: false,
    available: false,
    latestVersion: null,
    currentVersion: '',
    notes: null,
    pubDate: null,
    downloadUrl: null,
    checkedAtMs: null,
    trust: TRUST_STATES.UNVERIFIED,
    error: null,
    notificationSent: false
  });
  const [braveSearchConfigured, setBraveSearchConfigured] = useState(false);
  const [nativeSelfDevProof, setNativeSelfDevProof] = useState(() => {
    const stored = getStorage('alphonso_native_selfdev_proof', null);
    return stored && typeof stored === 'object' ? stored : null;
  });
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [lastTaskCompletedAt, setLastTaskCompletedAt] = useState(null);
  const [operatorMode, setOperatorModeState] = useState(() => Boolean(getStorage('alphonso_operator_mode_v1', false)));
  const setOperatorMode = useCallback((value) => {
    setOperatorModeState((current) => {
      const next = typeof value === 'function' ? value(current) : Boolean(value);
      setStorage('alphonso_operator_mode_v1', next);
      return next;
    });
  }, []);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isLocked, setIsLocked] = useState(false);
  const idleTimerRef = useRef(null);
  const [verificationLogs, setVerificationLogs] = useState(() => getVerificationLogs());
  const [durableAuditLogs, setDurableAuditLogs] = useState([]);
  const [auditChainProof, setAuditChainProof] = useState(null);
  const [pluginSandboxPolicy, setPluginSandboxPolicy] = useState(() => getPluginSandboxPolicy());
  const [memoryItems, setMemoryItems] = useState(() => listMemoryItems());
  const [plugins, setPlugins] = useState(() => listPlugins());
  const [pluginAudit, setPluginAudit] = useState(() => listPluginAudit());
  const [diskPluginManifests, setDiskPluginManifests] = useState([]);
  const [workspaceFoundation, setWorkspaceFoundation] = useState(() => getWorkspaceFoundation());
  const [workspaceProof, setWorkspaceProof] = useState(null);
  const [ocrCapability, setOcrCapability] = useState(null);
  const [workspaceSymbolIndex, setWorkspaceSymbolIndex] = useState(null);
  const [screenObserverState, setScreenObserverState] = useState(() => getScreenObserverState());
  const [screenObserverLogs, setScreenObserverLogs] = useState(() => getScreenObserverLogs());
  const [coachIntervention, setCoachIntervention] = useState(() => getLatestSessionGuardBridgeIntervention());
  const [coachPauseUntilMs, setCoachPauseUntilMs] = useState(0);
  const [lastPluginToolRun, setLastPluginToolRun] = useState(null);
  const [lastManifestValidation, setLastManifestValidation] = useState(null);
  const [lastOcrAdapterRun, setLastOcrAdapterRun] = useState(null);
  const [miyaCompanionState, setMiyaCompanionState] = useState({
    state: 'idle',
    message: 'Miya is ready.'
  });
  const [joseCompanionState, setJoseCompanionState] = useState({
    state: 'idle',
    message: 'Jose is coordinating quietly.'
  });
  const [hectorCompanionState, setHectorCompanionState] = useState({
    state: 'idle',
    message: 'Hector is standing by.',
    currentSourceUrl: null,
    lastRunSummary: ''
  });
  const [snapshots, setSnapshots] = useState(() => listSnapshots());
  const [coachMode, setCoachMode] = useState(false);
  const [coachAlwaysOnTop, setCoachAlwaysOnTop] = useState(true);
  const [coachMiniMode, setCoachMiniMode] = useState(() => {
    const layout = getStorage(COACH_LAYOUT_KEY, { mini: false, corner: 'bottom-right' });
    return Boolean(layout?.mini);
  });
  const [coachSnapCorner, setCoachSnapCorner] = useState(() => {
    const layout = getStorage(COACH_LAYOUT_KEY, { mini: false, corner: 'bottom-right' });
    return COACH_CORNERS.includes(layout?.corner) ? layout.corner : 'bottom-right';
  });
  const [showWorkflowPanel, setShowWorkflowPanel] = useState(false);
  const [approvalRequiredNotice, setApprovalRequiredNotice] = useState(false);
  const [approvalPending, setApprovalPending] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !getStorage('alphonso_onboarding_complete_v1', false)
  );
  const approvalResolveRef = useRef(null);
  const ollamaCheckRunRef = useRef(0);
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
      alphonso: {
        state: companionStateFromVoice(voice.voiceStatus),
        message: coachMessageFromVoice(voice.voiceStatus)
      },
      hector: hectorCompanionState,
      jose: joseCompanionState,
      miya: miyaCompanionState
    };
    return listAgentProfiles().map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      state: activeStates[agent.id]?.state || 'idle',
      message: activeStates[agent.id]?.message || agent.title || agent.role
    }));
  }, [hectorCompanionState, joseCompanionState, miyaCompanionState, voice.voiceStatus]);

  const writeNativeProofStage = useCallback(async (stageFileName, payload = {}) => {
    const proofWorkspaceRoot = String(payload.workspaceRoot || settings.workspaceRoot || getDefaultWorkspaceRoot() || '').trim();
    if (!proofWorkspaceRoot) return null;

    const stage = String(stageFileName || '').replace(/\.json$/i, '');
    const content = {
      timestamp: new Date().toISOString(),
      stage,
      status: payload.status || 'recorded',
      processId: payload.processId ?? null,
      workspaceRoot: proofWorkspaceRoot,
      error: payload.error ?? null,
      durationMs: payload.durationMs ?? null,
      ...payload
    };

    try {
      void invoke('alphonso-native-proof-stage', {
        fileName: stageFileName,
        ...content
      }).catch(() => {});
      void invoke('write_workspace_text_file', {
        workspaceRoot: proofWorkspaceRoot,
        relativePath: `release/rc0/proof/${stageFileName}`,
        content: JSON.stringify(content, null, 2)
      }).catch(() => {});
      return content;
    } catch {
      return null;
    }
  }, [settings.workspaceRoot]);

  const nativeProofHooks = useMemo(() => ({
    writeStage: writeNativeProofStage
  }), [writeNativeProofStage]);

  const runOllamaCheck = useOllamaHealth({
    settings,
    setSettings,
    desktopBridge,
    setOllamaStatus,
    setLastCheckedAt,
    setVerificationLogs,
    setMemoryItems,
    ollamaCheckRunRef
  });

  const installedModels = ollamaStatus.models || [];
  const selectedModelMissing = Boolean(
    settings.selectedModel &&
    installedModels.length > 0 &&
    !installedModels.some((model) => model.name === settings.selectedModel)
  );
  const companion = getCompanionState({
    ollamaStatus,
    voiceStatus: voice.voiceStatus,
    isGeneratingResponse,
    lastTaskCompletedAt,
    selectedModelMissing,
    privacyModeActive: settings.privacyShieldActive,
    approvalModeActive: settings.approvalMode,
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

  useAppKeyboardShortcuts({
    approvalPending,
    setApprovalPending,
    setApprovalRequiredNotice,
    approvalResolveRef,
    switchTab
  });

  useIdleLock({
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    setIsLocked,
    idleTimerRef
  });

  useAppEffects({
    settings,
    setSettings,
    conversations,
    setConversations,
    activeChatId,
    setActiveChatId,
    activeTab,
    ollamaStatus,
    desktopBridge,
    setDesktopBridge,
    coachMode,
    setCoachMode,
    coachMiniMode,
    setCoachMiniMode,
    coachAlwaysOnTop,
    coachSnapCorner,
    setIsLocked,
    setIsOnline,
    isCoachWindow,
    verificationLogs,
    setVerificationLogs,
    nativeSelfDevProof,
    setNativeSelfDevProof,
    workspaceFoundation,
    setWorkspaceFoundation,
    updateCheckState,
    setUpdateCheckState,
    setLastCheckedAt,
    joseCompanionState,
    setJoseCompanionState,
    hectorCompanionState,
    setHectorCompanionState,
    approvalRequiredNotice,
    setApprovalRequiredNotice,
    approvalPending,
    setApprovalPending,
    setBraveSearchConfigured,
    setDurableAuditLogs,
    setDiskPluginManifests,
    setMemoryItems,
    setPlugins,
    setPluginAudit,
    setScreenObserverState,
    setScreenObserverLogs,
    setCoachIntervention,
    setLastTaskCompletedAt,
    operatorMode,
    voice,
    toast,
    writeNativeProofStage,
    nativeProofHooks,
    runOllamaCheck,
    createNewChat,
    switchTab,
    approvalResolveRef,
    idleTimerRef,
    ollamaCheckRunRef,
    screenObserverRunRef,
    workspaceRootBootstrapRef,
    nativeSelfDevAutorunRef,
    prevOllamaStateRef
  });

  const deleteChat = (id, event) => {
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
  };

  const copyTroubleshootingCommand = async () => {
    try {
      await navigator.clipboard.writeText(OLLAMA_TROUBLESHOOTING_COMMAND);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 1600);
    }
  };

  const verifyOllamaWithProof = async () => {
    if (!await requestApproval('Run Ollama runtime verification')) return;
    await runOllamaCheck();
    const proof = await verifyOllamaRuntimeProof(settings.endpoint);
    setVerificationLogs((current) => [...current, proof].slice(-250));
  };

  const verifyProcesses = async (names) => {
    if (!await requestApproval(`Check process state: ${names.join(', ')}`)) return;
    const proof = await verifyProcessProof(names);
    setVerificationLogs((current) => [...current, proof].slice(-250));
  };

  const verifyPaths = async (paths) => {
    if (!await requestApproval(`Verify filesystem paths: ${paths.join(', ')}`)) return;
    const proof = await verifyPathProof(paths);
    setVerificationLogs((current) => [...current, proof].slice(-250));
  };

  const verifyAuditChain = async () => {
    if (!await requestApproval('Verify durable audit chain integrity')) return;
    const proof = await verifyDurableAuditChain();
    setAuditChainProof(proof?.payload || null);
    setVerificationLogs((current) => [...current, proof].slice(-250));
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const verifyCommand = async (program, args) => {
    if (!program) return;
    if (settings.safeMode) {
      const safePrograms = ['ollama', 'where', 'where.exe', 'tasklist', 'npm', 'npm.cmd'];
      if (!safePrograms.includes(program.toLowerCase())) {
        const log = appendVerificationLog({
          type: 'command_blocked_safe_mode',
          source: 'frontend-policy',
          trust: TRUST_STATES.VERIFIED,
          payload: {
            program,
            reason: 'Blocked by safe mode policy'
          }
        });
        setVerificationLogs((current) => [...current, log].slice(-250));
        setApprovalRequiredNotice(true);
        return;
      }
    }
    if (!await requestApproval(`Execute command: ${program} ${args.join(' ')}`)) return;
    const proof = await verifyCommandExecution(program, args, null);
    setVerificationLogs((current) => [...current, proof].slice(-250));
  };

  const handleTogglePlugin = async (pluginId, enabled) => {
    if (!await requestApproval(`${enabled ? 'Enable' : 'Disable'} plugin: ${pluginId}`)) return;
    setPlugins(togglePlugin(pluginId, enabled));
    setPluginAudit(listPluginAudit());
  };

  const handleToggleWorkspaceFeature = (featureKey, enabled) => {
    const feature = workspaceFoundation[featureKey] || {};
    setWorkspaceFoundation(updateWorkspaceFoundation({
      [featureKey]: {
        ...feature,
        enabled,
        verificationState: enabled ? TRUST_STATES.TEMPORARY : TRUST_STATES.UNVERIFIED
      }
    }));
  };

  const handleDiscoverPlugins = async () => {
    if (!await requestApproval('Discover plugin manifests from disk')) return;
    const manifests = await discoverDiskPluginManifests(settings.workspaceRoot);
    setDiskPluginManifests(manifests);
    const log = appendVerificationLog({
      type: 'plugin_manifest_scan',
      source: 'tauri-command',
      trust: TRUST_STATES.VERIFIED,
      payload: {
        workspaceRoot: settings.workspaceRoot || null,
        count: manifests.length
      }
    });
    setVerificationLogs((current) => [...current, log].slice(-250));
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleRunWorkspaceProof = async () => {
    if (!settings.workspaceRoot) {
      const log = appendVerificationLog({
        type: 'workspace_proof',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: 'Workspace root is not set.'
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      return;
    }
    if (!await requestApproval(`Collect workspace proof for ${settings.workspaceRoot}`)) return;
    try {
      const proof = await collectWorkspaceProof(settings.workspaceRoot, 1200);
      setWorkspaceProof(proof);
      const log = appendVerificationLog({
        type: 'workspace_proof',
        source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        payload: proof
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      setWorkspaceFoundation(updateWorkspaceFoundation({
        workspaceProof: {
          lastRunAt: Date.now(),
          trust: proof?.trust || TRUST_STATES.UNVERIFIED
        }
      }));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'workspace_proof',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: String(error)
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    }
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleCheckOcrCapability = async () => {
    if (!await requestApproval('Check OCR engine capability')) return;
    try {
      const proof = await checkOcrCapability(settings.ocrEnginePath);
      setOcrCapability(proof);
      const log = appendVerificationLog({
        type: 'ocr_capability_check',
        source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.UNVERIFIED,
        payload: proof
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      setWorkspaceFoundation(updateWorkspaceFoundation({
        ocrCapability: {
          available: Boolean(proof?.available),
          engine: proof?.engine || 'unconfigured',
          message: proof?.message || '',
          checkedAtMs: proof?.checked_at_ms || Date.now(),
          verificationState: proof?.trust || TRUST_STATES.UNVERIFIED
        }
      }));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'ocr_capability_check',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: String(error)
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    }
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleBuildSymbolIndex = async () => {
    if (!settings.workspaceRoot) {
      const log = appendVerificationLog({
        type: 'symbol_index_build',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: 'Workspace root is not set.'
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      return;
    }
    if (!await requestApproval(`Build workspace symbol index for ${settings.workspaceRoot}`)) return;
    try {
      const index = await buildWorkspaceSymbolIndex(settings.workspaceRoot, 500);
      setWorkspaceSymbolIndex(index);
      const log = appendVerificationLog({
        type: 'symbol_index_build',
        source: 'tauri-command',
        trust: index?.trust || TRUST_STATES.TEMPORARY,
        payload: {
          root: index?.root,
          filesIndexed: index?.files_indexed,
          totals: index?.totals
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'symbol_index_build',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: String(error)
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    }
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleExecutePluginTool = async ({ manifestPath, pluginId, toolId, extraArgs }) => {
    const policyCheck = evaluatePluginExecutionPolicy({
      manifestPath,
      pluginId,
      toolId,
      extraArgs
    });
    if (!policyCheck.allowed) {
      const log = appendVerificationLog({
        type: 'plugin_tool_execution_blocked',
        source: 'plugin-sandbox-policy',
        trust: TRUST_STATES.FAILED,
        payload: policyCheck
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      appendPluginAuditEntry({
        pluginId: pluginId || 'unknown',
        action: 'tool_execution_blocked_local_policy',
        trust: TRUST_STATES.FAILED,
        details: {
          toolId: toolId || '',
          violations: policyCheck?.violations || []
        }
      });
      setPluginAudit(listPluginAudit());
      setApprovalRequiredNotice(true);
      return;
    }

    if (pluginSandboxPolicy.requireManifestValidation) {
      try {
        const validation = await validatePluginManifestDisk(manifestPath);
        setLastManifestValidation(validation);
        if (!validation.valid) {
          const log = appendVerificationLog({
            type: 'plugin_manifest_validation_blocked',
            source: 'plugin-sandbox-policy',
            trust: TRUST_STATES.FAILED,
            payload: validation
          });
          setVerificationLogs((current) => [...current, log].slice(-250));
          appendPluginAuditEntry({
            pluginId: pluginId || 'unknown',
            action: 'manifest_validation_blocked',
            trust: TRUST_STATES.FAILED,
            details: {
              toolId: toolId || '',
              errors: validation?.errors || [],
              warnings: validation?.warnings || []
            }
          });
          setPluginAudit(listPluginAudit());
          setApprovalRequiredNotice(true);
          return;
        }
      } catch (error) {
        const log = appendVerificationLog({
          type: 'plugin_manifest_validation_blocked',
          source: 'plugin-sandbox-policy',
          trust: TRUST_STATES.FAILED,
          payload: { error: String(error) }
        });
        setVerificationLogs((current) => [...current, log].slice(-250));
        appendPluginAuditEntry({
          pluginId: pluginId || 'unknown',
          action: 'manifest_validation_failed',
          trust: TRUST_STATES.FAILED,
          details: {
            toolId: toolId || '',
            error: String(error)
          }
        });
        setPluginAudit(listPluginAudit());
        setApprovalRequiredNotice(true);
        return;
      }
    }

    if (!await requestApproval(`Execute plugin tool ${pluginId}:${toolId}`)) return;
    try {
      const proof = await executePluginToolRun({
        manifestPath,
        pluginId,
        toolId,
        extraArgs,
        workspaceRoot: settings.workspaceRoot
      });
      setLastPluginToolRun(proof);
      const log = appendVerificationLog({
        type: 'plugin_tool_execution',
        source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        payload: {
          pluginId: proof?.plugin_id,
          toolId: proof?.tool_id,
          success: proof?.success,
          exitCode: proof?.exit_code
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      appendPluginAuditEntry({
        pluginId: proof?.plugin_id || pluginId || 'unknown',
        action: proof?.success ? 'tool_execution_success' : 'tool_execution_failed',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        details: {
          toolId: proof?.tool_id || toolId || '',
          exitCode: proof?.exit_code ?? null
        }
      });
      setPluginAudit(listPluginAudit());
    } catch (error) {
      const log = appendVerificationLog({
        type: 'plugin_tool_execution',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: String(error)
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      appendPluginAuditEntry({
        pluginId: pluginId || 'unknown',
        action: 'tool_execution_error',
        trust: TRUST_STATES.FAILED,
        details: {
          toolId: toolId || '',
          error: String(error)
        }
      });
      setPluginAudit(listPluginAudit());
    }
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleUpdatePluginSandboxPolicy = (patch) => {
    const next = updatePluginSandboxPolicy(patch);
    setPluginSandboxPolicy(next);
    const log = appendVerificationLog({
      type: 'plugin_sandbox_policy_update',
      source: 'operator-dashboard',
      trust: TRUST_STATES.VERIFIED,
      payload: next
    });
    setVerificationLogs((current) => [...current, log].slice(-250));
  };

  const handleValidatePluginManifest = async (manifestPath) => {
    if (!manifestPath) return;
    if (!await requestApproval(`Validate plugin manifest ${manifestPath}`)) return;
    try {
      const validation = await validatePluginManifestDisk(manifestPath);
      setLastManifestValidation(validation);
      const log = appendVerificationLog({
        type: 'plugin_manifest_validation',
        source: 'tauri-command',
        trust: validation?.trust || TRUST_STATES.TEMPORARY,
        payload: validation
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      appendPluginAuditEntry({
        pluginId: 'manifest_validation',
        action: validation?.valid ? 'manifest_valid' : 'manifest_invalid',
        trust: validation?.trust || TRUST_STATES.TEMPORARY,
        details: {
          manifestPath,
          errors: validation?.errors || [],
          warnings: validation?.warnings || []
        }
      });
      setPluginAudit(listPluginAudit());
    } catch (error) {
      const log = appendVerificationLog({
        type: 'plugin_manifest_validation',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: String(error)
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      appendPluginAuditEntry({
        pluginId: 'manifest_validation',
        action: 'manifest_validation_error',
        trust: TRUST_STATES.FAILED,
        details: {
          manifestPath,
          error: String(error)
        }
      });
      setPluginAudit(listPluginAudit());
    }
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleRunOcrAdapter = async ({ adapter, imagePath, extraArgs }) => {
    if (!settings.ocrEnginePath) {
      const log = appendVerificationLog({
        type: 'ocr_adapter_run',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: 'OCR engine path is not set.'
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
      return;
    }
    if (!await requestApproval(`Run OCR adapter ${adapter}`)) return;
    try {
      const proof = await runOcrAdapter({
        adapter,
        enginePath: settings.ocrEnginePath,
        imagePath: imagePath || null,
        extraArgs
      });
      setLastOcrAdapterRun(proof);
      const log = appendVerificationLog({
        type: 'ocr_adapter_run',
        source: 'tauri-command',
        trust: proof?.trust || TRUST_STATES.TEMPORARY,
        payload: {
          adapter: proof?.adapter,
          success: proof?.success,
          exitCode: proof?.exit_code
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    } catch (error) {
      const log = appendVerificationLog({
        type: 'ocr_adapter_run',
        source: 'tauri-command',
        trust: TRUST_STATES.FAILED,
        payload: {
          error: String(error)
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    }
    setDurableAuditLogs(await readDurableAuditLog(200));
  };

  const handleCreateSnapshot = async () => {
    if (!await requestApproval('Create restore point snapshot')) return;
    const snapshot = await createSnapshot({
      settings,
      ollamaStatus,
      activeChatId,
      verificationLogCount: verificationLogs.length,
      memoryCount: memoryItems.length
    });
    setSnapshots((current) => [...current, snapshot].slice(-40));
  };

  const handleRestoreSnapshot = async (snapshotId) => {
    if (!await requestApproval(`Restore snapshot: ${snapshotId}`)) return;
    const payload = restoreSnapshotById(snapshotId);
    if (!payload) return;

    if (payload.settings) {
      setSettings(payload.settings);
    }
    if (payload.activeChatId) {
      setActiveChatId(payload.activeChatId);
    }
    if (payload.ollamaStatus) {
      setOllamaStatus(payload.ollamaStatus);
    }

    const log = appendVerificationLog({
      type: 'restore_snapshot',
      source: 'local-recovery',
      trust: TRUST_STATES.VERIFIED,
      payload: { snapshotId }
    });
    setVerificationLogs((current) => [...current, log].slice(-250));
    setLastTaskCompletedAt(Date.now());
  };

  const handleBackupMemory = async () => {
    if (!await requestApproval('Create memory backup')) return;
    const backup = backupMemoryLedger(memoryItems);
    const log = appendVerificationLog({
      type: 'memory_backup',
      source: 'local-recovery',
      trust: TRUST_STATES.VERIFIED,
      payload: { backupId: backup.id, count: backup.items.length }
    });
    setVerificationLogs((current) => [...current, log].slice(-250));
  };

  const handleRunReleasePreflight = async () => {
    if (!await requestApproval('Run release preflight: test + build + tauri build')) return;
    await verifyCommand('npm.cmd', ['run', 'verify:desktop']);
  };

  const handleRequestScreenObserverPermission = async () => {
    if (!await requestApproval('Request desktop notification permission for screen alerts')) return;
    const permission = await requestScreenNotificationPermission();
    const next = updateScreenObserverState({
      currentSummary: permission === 'granted'
        ? 'Notification permission granted.'
        : permission === 'unsupported'
          ? 'Notifications are unsupported in this runtime.'
          : 'Notification permission not granted.'
    });
    setScreenObserverState(next);
  };

  const handleStartScreenObserver = async () => {
    if (!await requestApproval('Start visible screen observer (manual permission prompt)')) return;
    const current = getScreenObserverState();
    const result = await startScreenObserver({
      sampleEveryMs: current.sampleEveryMs || 5000,
      notificationsEnabled: current.notificationsEnabled !== false,
      audioAlertEnabled: current.audioAlertEnabled === true,
      onUpdate: (nextState, event) => {
        setScreenObserverState(nextState);
        if (event) {
          setScreenObserverLogs(getScreenObserverLogs());
          pushMemoryItem({
            title: `Screen observer: ${event.status}`,
            category: 'workspace_memory',
            content: `${event.summary} (change ${event.changeLevel})`,
            source: 'screen-observer',
            sourceAgent: 'alphonso',
            confidence: TRUST_STATES.INFERRED,
            verificationState: TRUST_STATES.INFERRED,
            expiresAt: timestampMs() + 7 * 24 * 60 * 60 * 1000,
            expiryRule: 'visual_pattern_7d'
          });
          if (event.status === 'high_change_detected' || event.status === 'pattern_repeated') {
            setHectorCompanionState({
              state: 'warning',
              message: event.summary,
              currentSourceUrl: null,
              lastRunSummary: event.summary
            });
          }
        }
      }
    });
    screenObserverRunRef.current = Boolean(result?.ok);
    if (result?.ok) {
      setWorkspaceFoundation(updateWorkspaceFoundation({
        screenCapture: {
          ...(workspaceFoundation.screenCapture || {}),
          enabled: true,
          verificationState: TRUST_STATES.INFERRED
        }
      }));
    }
    setScreenObserverLogs(getScreenObserverLogs());
  };

  const handleStopScreenObserver = () => {
    const next = stopScreenObserver();
    screenObserverRunRef.current = false;
    setWorkspaceFoundation(updateWorkspaceFoundation({
      screenCapture: {
        ...(workspaceFoundation.screenCapture || {}),
        enabled: false,
        verificationState: TRUST_STATES.TEMPORARY
      }
    }));
    setScreenObserverState(next);
    setScreenObserverLogs(getScreenObserverLogs());
  };

  const handleUpdateScreenObserverSettings = (patch) => {
    const next = updateScreenObserverState(patch);
    setScreenObserverState(next);
  };

  const handleExportDiagnostics = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      modes: {
        operatorMode,
        localOnlyMode: settings.localOnlyMode,
        zeroCostMode: settings.zeroCostMode,
        approvalMode: settings.approvalMode,
        safeMode: settings.safeMode,
        privacyShieldActive: settings.privacyShieldActive
      },
      runtime: {
        ollamaStatus,
        desktopBridge,
        selectedModel: settings.selectedModel,
        endpoint: settings.endpoint,
        lastCheckedAt: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : null
      },
      counts: {
        verificationLogs: verificationLogs.length,
        memoryItems: memoryItems.length,
        plugins: plugins.length,
        snapshots: snapshots.length
      },
      verificationLogs,
      durableAuditLogs,
      memoryItems,
      plugins,
      diskPluginManifests,
      pluginAudit,
      snapshots,
      workspaceFoundation,
      workspaceProof,
      ocrCapability,
      workspaceSymbolIndex,
      lastPluginToolRun,
      lastManifestValidation,
      lastOcrAdapterRun,
      auditChainProof,
      pluginSandboxPolicy
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

    const log = appendVerificationLog({
      type: 'diagnostics_export',
      source: 'operator-dashboard',
      trust: TRUST_STATES.VERIFIED,
      payload: { bytes: blob.size }
    });
    setVerificationLogs((current) => [...current, log].slice(-250));
  };

  const handleRuntimeRepair = async () => {
    if (!await requestApproval('Run supervised runtime repair checks')) return;
    await runOllamaCheck();
    await verifyProcesses(['ollama']);
    const log = appendVerificationLog({
      type: 'runtime_repair',
      source: 'supervised-repair',
      trust: TRUST_STATES.TEMPORARY,
      payload: { status: 'repair checks completed' }
    });
    setVerificationLogs((current) => [...current, log].slice(-250));
  };

  const handleToggleCoachMode = async () => {
    if (coachMode) {
      await closeCoachWindow();
      setCoachMode(false);
      return;
    }
    await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
    setCoachMode(true);
  };

  const handleToggleCoachTop = async () => {
    const next = !coachAlwaysOnTop;
    setCoachAlwaysOnTop(next);
    if (coachMode) {
      await openCoachWindow(next, settings.coachAgent || 'alphonso');
    }
  };

  const minimizeToCoach = async () => {
    try {
      await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
      setCoachMode(true);
      await getCurrentWindow().minimize();
    } catch {
      // Ignore when not in Tauri runtime.
    }
  };

  const openAlphonsoDesktopCard = async () => {
    try {
      await openCoachWindow(coachAlwaysOnTop, 'alphonso');
      setCoachMode(true);
    } catch {
      // Ignore when not in Tauri runtime.
    }
  };

  const handleCoachInterventionAction = (action) => {
    if (!coachIntervention) return;

    const details = action === 'pause_60_seconds' ? { durationMs: 60000 } : {};
    recordCoachInterventionAction(coachIntervention, action, details);

    if (action === 'pause_60_seconds') {
      setCoachPauseUntilMs(Date.now() + 60000);
      return;
    }

    if (['end_session', 'continue', 'continue_anyway'].includes(action)) {
      setCoachIntervention(null);
    }
  };

  if (isCoachWindow) {
    const coachAgent = coachAgentFromQuery || settings.coachAgent || 'alphonso';
    const coachState = coachAgent === 'miya'
      ? miyaCompanionState
      : coachAgent === 'jose'
        ? joseCompanionState
        : coachAgent === 'hector'
          ? hectorCompanionState
          : {
            state: companionStateFromVoice(voice.voiceStatus),
            message: coachMessageFromVoice(voice.voiceStatus)
          };
    const coachSkills = listCoachSkills();
    const showDemoIntervention = () => setCoachIntervention(buildDemoSlotIntervention());
    const cornerClass = {
      'bottom-right': 'items-end justify-end',
      'bottom-left': 'items-end justify-start',
      'top-right': 'items-start justify-end',
      'top-left': 'items-start justify-start'
    }[coachSnapCorner] || 'items-end justify-end';

    return (
      <div data-alphonso-shell-ready="true" className={`h-screen w-screen bg-zinc-950 text-zinc-100 flex p-4 ${coachMiniMode ? cornerClass : 'items-center justify-center'}`}>
        <div className={`${coachMiniMode ? 'w-[22rem] rounded-2xl border border-cyan-300/20 bg-zinc-900/85 p-3' : 'w-full h-full rounded-2xl border border-white/10 bg-zinc-900/70 p-4'}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500 font-bold">Coach Mode</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCoachMiniMode((current) => !current)}
                className="rounded-lg border border-white/10 bg-zinc-800 px-2 py-1 text-2xs font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
              >
                {coachMiniMode ? 'Full' : 'Mini'}
              </button>
              <button
                onClick={() => setCoachSnapCorner((current) => nextCoachCorner(current))}
                className="rounded-lg border border-white/10 bg-zinc-800 px-2 py-1 text-2xs font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700"
              >
                Snap: {coachSnapCorner}
              </button>
            </div>
          </div>

          {coachMiniMode ? (
            <div className="space-y-3">
              <CoachInterventionCard intervention={coachIntervention} onAction={handleCoachInterventionAction} onDemo={showDemoIntervention} pauseUntilMs={coachPauseUntilMs} />
              <CoachMissionBadge agent={coachAgent} state={coachState.state} message={coachState.message} />
              <CoachSkillGrid skills={coachSkills.slice(0, 4)} compact />
              <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-2">
                <Suspense fallback={null}>
                  <MicrophoneStatus voiceStatus={voice.voiceStatus} />
                </Suspense>
              </div>
            </div>
          ) : (
            <div className="grid h-[calc(100%-2.5rem)] grid-cols-[minmax(0,1fr)_17rem] gap-4">
              <div className="space-y-4 overflow-auto pr-1">
                <CoachInterventionCard intervention={coachIntervention} onAction={handleCoachInterventionAction} onDemo={showDemoIntervention} pauseUntilMs={coachPauseUntilMs} />
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/5 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Coach skills</div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    Coach Mode is for guidance, focus, handoffs, rehearsal, and safety checks — not just agent status.
                  </p>
                </div>
                <CoachSkillGrid skills={coachSkills} />
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/45 p-3">
                <div className="mb-2 text-2xs font-bold uppercase tracking-[0.16em] text-zinc-500">Agent status</div>
                <div className="space-y-2">
                  <CoachMissionBadge agent="alphonso" state={companionStateFromVoice(voice.voiceStatus)} message={coachMessageFromVoice(voice.voiceStatus)} />
                  <CoachMissionBadge agent="hector" state={hectorCompanionState.state} message={hectorCompanionState.message} />
                  <CoachMissionBadge agent="jose" state={joseCompanionState.state} message={joseCompanionState.message} />
                  <CoachMissionBadge agent="miya" state={miyaCompanionState.state} message={miyaCompanionState.message} />
                </div>
              </div>
            </div>
          )}
          {coachMiniMode && (
            <div className="mt-2 text-2xs text-zinc-500">
              Mini mode is always-on-top friendly and corner-snapped for fast glance monitoring.
            </div>
          )}
          <div className="mt-2 text-2xs text-zinc-600">
            Desktop coach card is local-only and supervised.
          </div>
        </div>
      </div>
    );
  }

  if (showOnboarding && !settings.selectedModel && !isCoachWindow) {
    return (
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-500 text-sm">Loading...</div>}>
        <OnboardingWizard
          onComplete={(chosenModel) => {
            if (chosenModel) {
              setSettings((current) => ({ ...current, selectedModel: chosenModel }));
            }
            setShowOnboarding(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div data-alphonso-shell-ready="true" className={`flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-indigo-500/30 ${themeClassFromSettings(settings)}`}>
      <CoachHardInterruptOverlay intervention={coachIntervention} pauseUntilMs={coachPauseUntilMs} onAction={handleCoachInterventionAction} />
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
          <CommandRib
            activeTab={activeTab}
            setActiveTab={switchTab}
            settings={settings}
            setSettings={setSettings}
            ollamaStatus={ollamaStatus}
            operatorMode={operatorMode}
          />
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
                <MissionControlHome
                  settings={settings}
                  ollamaStatus={ollamaStatus}
                  operatorMode={operatorMode}
                  coachMode={coachMode}
                  coachIntervention={coachIntervention}
                  verificationLogs={verificationLogs}
                  memoryItems={memoryItems}
                  updateCheckState={updateCheckState}
                  onNavigate={switchTab}
                />
              )}
              {activeTab === 'mission_room' && (
                <MissionRoom
                  onCreateApprovalRequest={() => setApprovalRequiredNotice(true)}
                />
              )}
              {activeTab === 'chat' && (
                <ChatView
                  activeChatId={activeChatId}
                  settings={settings}
                  setConversations={setConversations}
                  ollamaStatus={ollamaStatus}
                  installedModels={installedModels}
                  selectedModelMissing={selectedModelMissing}
                  voice={voice}
                  onGenerationChange={setIsGeneratingResponse}
                  onTaskComplete={() => setLastTaskCompletedAt(Date.now())}
                  onRetryOllama={runOllamaCheck}
                  onJoseExecutionState={(state, message) => setJoseCompanionState({ state, message })}
                  onOpenSettings={() => switchTab('settings')}
                  onModelChange={(modelName) => setSettings((current) => ({ ...current, selectedModel: modelName }))}
                />
              )}
              {activeTab === 'miya' && (
                <MiyaStudio
                  settings={settings}
                  ollamaStatus={ollamaStatus}
                  onStudioStateChange={(state, message) => setMiyaCompanionState({ state, message })}
                  onPacketCreated={() => {
                    const log = appendVerificationLog({
                      type: 'miya_handoff_packet_created',
                      source: 'miya-studio',
                      trust: TRUST_STATES.TEMPORARY,
                      payload: {
                        selectedModel: settings.selectedModel || null
                      }
                    });
                    setVerificationLogs((current) => [...current, log].slice(-250));
                  }}
                />
              )}
              {activeTab === 'content' && (
                <ContentCatalystWorkspace
                  settings={settings}
                  onJobChange={(job) => {
                    if (!job) return;
                    const log = appendVerificationLog({
                      type: 'content_catalyst_job_update',
                      source: 'content-catalyst',
                      trust: TRUST_STATES.TEMPORARY,
                      payload: {
                        jobId: job.id,
                        status: job.status,
                        currentStep: job.currentStep
                      }
                    });
                    setVerificationLogs((current) => [...current, log].slice(-250));
                  }}
                  onApprovalRequest={(approval) => {
                    if (!approval) return;
                    const log = appendVerificationLog({
                      type: 'content_catalyst_publish_approval',
                      source: 'content-catalyst',
                      trust: TRUST_STATES.TEMPORARY,
                      payload: approval
                    });
                    setVerificationLogs((current) => [...current, log].slice(-250));
                  }}
                />
              )}
              {activeTab === 'hector' && (
                <HectorResearchDesk
                  onHectorStateChange={(payload) => {
                    if (!payload) return;
                    setHectorCompanionState((current) => ({
                      ...current,
                      ...payload
                    }));
                  }}
                />
              )}
              {activeTab === 'automation' && <AutomationView />}
              {activeTab === 'files' && <FilesView memoryItems={memoryItems} />}
              {activeTab === 'ecosystem' && (
                <EcosystemHub
                  settings={settings}
                  setSettings={setSettings}
                  ollamaStatus={ollamaStatus}
                  verificationLogs={verificationLogs}
                  memoryItems={memoryItems}
                  voiceStatus={voice.voiceStatus}
                  workspaceFoundation={workspaceFoundation}
                  updateCheckState={updateCheckState}
                  nativeSelfDevProof={nativeSelfDevProof}
                  setNativeSelfDevProof={setNativeSelfDevProof}
                  nativeProofHooks={nativeProofHooks}
                />
              )}
              {activeTab === 'project_execution' && <ProjectExecutionMode />}
              {activeTab === 'orchestrator' && (
                <OrchestratorView
                  settings={settings}
                  ollamaStatus={ollamaStatus}
                  onJoseStateChange={(state, message) => setJoseCompanionState({ state, message })}
                />
              )}
              {activeTab === 'workflows' && (
                <div className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-200">Workflows</div>
                    <div className="text-xs text-zinc-500">Trigger and review workflows from this panel.</div>
                  </div>
                  <button
                    onClick={() => setShowWorkflowPanel(true)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-200 hover:border-white/20"
                  >
                    Open Workflows
                  </button>
                </div>
              )}
              {activeTab === 'operator' && (
                <OperatorDashboard
                  operatorMode={operatorMode}
                  setOperatorMode={setOperatorMode}
                  ollamaStatus={ollamaStatus}
                  lastCheckedAt={lastCheckedAt}
                  verificationLogs={verificationLogs}
                  onVerifyOllama={verifyOllamaWithProof}
                  onVerifyAuditChain={verifyAuditChain}
                  onVerifyProcess={verifyProcesses}
                  onVerifyPaths={verifyPaths}
                  onVerifyCommand={verifyCommand}
                  memoryItems={memoryItems}
                  plugins={plugins}
                  diskPluginManifests={diskPluginManifests}
                  pluginAudit={pluginAudit}
                  onTogglePlugin={handleTogglePlugin}
                  onDiscoverPlugins={handleDiscoverPlugins}
                  workspaceFoundation={workspaceFoundation}
                  onToggleWorkspaceFeature={handleToggleWorkspaceFeature}
                  workspaceProof={workspaceProof}
                  ocrCapability={ocrCapability}
                  onRunWorkspaceProof={handleRunWorkspaceProof}
                  onCheckOcrCapability={handleCheckOcrCapability}
                  workspaceSymbolIndex={workspaceSymbolIndex}
                  onBuildSymbolIndex={handleBuildSymbolIndex}
                  onExecutePluginTool={handleExecutePluginTool}
                  onValidatePluginManifest={handleValidatePluginManifest}
                  lastPluginToolRun={lastPluginToolRun}
                  lastManifestValidation={lastManifestValidation}
                  pluginSandboxPolicy={pluginSandboxPolicy}
                  onUpdatePluginSandboxPolicy={handleUpdatePluginSandboxPolicy}
                  auditChainProof={auditChainProof}
                  onRunOcrAdapter={handleRunOcrAdapter}
                  lastOcrAdapterRun={lastOcrAdapterRun}
                  snapshots={snapshots}
                  onCreateSnapshot={handleCreateSnapshot}
                  onRestoreSnapshot={handleRestoreSnapshot}
                  onBackupMemory={handleBackupMemory}
                  onRunRuntimeRepair={handleRuntimeRepair}
                  onRunReleasePreflight={handleRunReleasePreflight}
                  onExportDiagnostics={handleExportDiagnostics}
                  durableAuditLogs={durableAuditLogs}
                  coachMode={coachMode}
                  coachAlwaysOnTop={coachAlwaysOnTop}
                  onToggleCoachMode={handleToggleCoachMode}
                  onToggleCoachTop={handleToggleCoachTop}
                  screenObserverState={screenObserverState}
                  screenObserverLogs={screenObserverLogs}
                  onRequestScreenObserverPermission={handleRequestScreenObserverPermission}
                  onStartScreenObserver={handleStartScreenObserver}
                  onStopScreenObserver={handleStopScreenObserver}
                  onUpdateScreenObserverSettings={handleUpdateScreenObserverSettings}
                  modes={settings}
                />
              )}
              {activeTab === 'settings' && (
                <Suspense fallback={null}>
                  <SettingsView
                    settings={settings}
                    setSettings={setSettings}
                    ollamaStatus={ollamaStatus}
                    installedModels={installedModels}
                    selectedModelMissing={selectedModelMissing}
                    onCheckOllama={runOllamaCheck}
                    onCopyTroubleshootingCommand={copyTroubleshootingCommand}
                    copyState={copyState}
                    updateCheckState={updateCheckState}
                    onCheckUpdates={() => runOllamaCheck()}
                    normalizeEndpoint={normalizeEndpoint}
                    ollamaTroubleshootingCommand={OLLAMA_TROUBLESHOOTING_COMMAND}
                    braveSearchConfigured={braveSearchConfigured}
                  />
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
        <RightPanel
          settings={settings}
          ollamaStatus={ollamaStatus}
          installedModels={installedModels}
          desktopBridge={desktopBridge}
          voiceStatus={voice.voiceStatus}
          selectedModelMissing={selectedModelMissing}
          lastCheckedAt={lastCheckedAt}
          onCheckOllama={runOllamaCheck}
          onCopyTroubleshootingCommand={copyTroubleshootingCommand}
          copyState={copyState}
          onMinimizeToCoach={minimizeToCoach}
          operatorMode={operatorMode}
          approvalRequiredNotice={approvalRequiredNotice}
          miyaCompanionState={miyaCompanionState}
          joseCompanionState={joseCompanionState}
          hectorCompanionState={hectorCompanionState}
          screenObserverState={screenObserverState}
          updateCheckState={updateCheckState}
          onCheckUpdates={() => runOllamaCheck()}
        />
      </Suspense>

      {showWorkflowPanel ? (
        <WorkflowPanel onClose={() => setShowWorkflowPanel(false)} onRunWorkflow={(workflowId) => switchTab('activity')} />
      ) : null}
    </div>
  );
}
