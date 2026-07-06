import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useVoiceInput } from './hooks/useVoiceInput';
import { getVerificationLogs } from './services/verificationService';
import { appendVerificationLog } from './services/verificationService';
import { TRUST_STATES } from './services/trustModel';
import { sendNativeNotification } from './services/notificationService';
import { checkAppUpdate } from './services/appUpdateService';
import { needsHighRiskApproval } from './lib/chatUtils';
import { UpdaterNotification } from './components/UpdaterNotification';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { useToast } from './components/ToastProvider';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OllamaOfflineBanner } from './components/OllamaOfflineBanner';
import { NotificationCenter, loadPersistedNotifications } from './components/NotificationCenter';
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
const BoardroomView = lazy(() => import('./components/BoardroomView').then((mod) => ({ default: mod.BoardroomView })));

function MissionRoomBoardroomTabs({ onCreateApprovalRequest }: { onCreateApprovalRequest: () => void }) {
  const [subTab, setSubTab] = React.useState<'mission' | 'boardroom'>('mission');
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-5 pt-3 pb-0 border-b border-[var(--border)] shrink-0">
        {(['mission', 'boardroom'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              subTab === t
                ? 'bg-[var(--surface-1)] border border-b-0 border-[var(--border)] text-[var(--text-1)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
            }`}
          >
            {t === 'mission' ? 'Mission Room' : 'Boardroom Sessions'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {subTab === 'mission' ? (
          <MissionRoom onCreateApprovalRequest={onCreateApprovalRequest} />
        ) : (
          <Suspense fallback={null}><BoardroomView /></Suspense>
        )}
      </div>
    </div>
  );
}
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
  const [updaterDownloadUrl, setUpdaterDownloadUrl] = useState<string | null>(null);

  // Notification center state
  type NotificationType = 'success' | 'warning' | 'error' | 'info';
  interface AppNotification { id: string; type: NotificationType; title: string; message: string; timestamp: number; }
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadPersistedNotifications() as AppNotification[]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

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

  useAppKeyboardShortcuts({ approvalPending, setApprovalPending, setApprovalRequiredNotice, approvalResolveRef, switchTab, setShowKeyboardShortcuts });
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

  // Crash-recovery checkpoint: on boot, recover any packet left stuck in
  // 'queued'/'executing' state by a prior crash or forced restart, so
  // in-flight work never sits silently orphaned. See ALPHONSOTOTHEMOON.md
  // Sprint 2 item #6.
  useEffect(() => {
    (async () => {
      try {
        const { recoverInterruptedExecutions } = await import('./services/orchestrationQueueService');
        const result = recoverInterruptedExecutions();
        if (result.recoveredCount > 0) {
          addNotification({
            type: 'warning',
            title: 'Recovered interrupted work',
            message: `${result.recoveredCount} task(s) were left in-flight by a prior restart and marked for retry.`
          });
        }
      } catch { /* non-critical */ }
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
  }, []);

  // Jose scheduler background service
  useEffect(() => {
    let schedulerStop: (() => void) | null = null;
    (async () => {
      try {
        const { startScheduler } = await import('./services/joseSchedulerService');
        schedulerStop = startScheduler((schedule) => {
          addNotification({
            type: 'info',
            title: `Scheduled: ${schedule.name}`,
            message: `Executing: ${String(schedule.commandText || '').slice(0, 100)}`
          });
        });
      } catch { /* non-critical */ }
    })();
    return () => { try { schedulerStop?.(); } catch { /* ignore */ } };
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
  }, []);

  // Generic webhook gateway poller — drains gateway/generic-webhook/ if configured.
  // See ALPHONSOTOTHEMOON.md Sprint 2 item #8.
  useEffect(() => {
    let webhookPollStop: (() => void) | null = null;
    (async () => {
      try {
        const { startGenericWebhookPolling } = await import('./services/genericWebhookService');
        const { getConnectorCredential } = await import('./services/connectors/connectorAuth');
        const drainUrl = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_DRAIN_URL');
        if (drainUrl) {
          webhookPollStop = startGenericWebhookPolling((result) => {
            if (result?.events?.length > 0) {
              addNotification({
                type: 'info',
                title: 'Webhook event received',
                message: `${result.events.length} inbound event(s) drained from the generic webhook gateway.`
              });
            }
          });
        }
      } catch { /* non-critical */ }
    })();
    return () => { try { webhookPollStop?.(); } catch { /* ignore */ } };
  }, []);

  // App update check (Tauri-only) — mirrors the endpoint/pubkey configured in
  // tauri-conf.json's plugins.updater block. checkAppUpdate() and the
  // UpdaterNotification component already existed and were already tested,
  // but nothing ever called the former or wired a real handler to the
  // latter's Update button, so the banner could never appear. Fixed here.
  // Full in-app download+install+relaunch (vs. opening the release page)
  // needs @tauri-apps/plugin-updater + plugin-process, not installed yet —
  // tracked as a Sprint follow-up in ALPHONSOTOTHEMOON.md.
  useEffect(() => {
    if (typeof window.__TAURI_INTERNALS__ === 'undefined') return;
    (async () => {
      try {
        const { checkAppUpdate, getLastUpdateNotice, setLastUpdateNotice } = await import('./services/appUpdateService');
        const result = await checkAppUpdate({
          endpoint: 'https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest/download/latest.json',
          pubkey: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDJENzgyMEY4MkZGMTE3OUMKUldTY0YvRXYrQ0I0TGRlVWt2cmZhcGVaUVRtQ0lZcDZkZUl5YmxqcEZvbjFYTG01ZnJvWVgwMUgK'
        });
        if (result.available && result.latestVersion) {
          const lastNotice = getLastUpdateNotice();
          if (lastNotice?.latestVersion !== result.latestVersion) {
            setUpdaterVersion(result.latestVersion);
            setUpdaterDownloadUrl(result.downloadUrl);
            setLastUpdateNotice({ latestVersion: result.latestVersion, noticedAtMs: Date.now() });
          }
        }
      } catch { /* non-critical */ }
    })();
  }, []);

  // Voice OS watchdog — restarts voice server if it dies (Tauri-only)
  useEffect(() => {
    if (typeof window.__TAURI_INTERNALS__ === 'undefined') return;
    let stopFn: (() => void) | null = null;
    import('./services/voiceOsService').then(({ startVoiceWatchdog, stopVoiceWatchdog }: any) => {
      startVoiceWatchdog();
      stopFn = stopVoiceWatchdog;
    }).catch(() => { /* non-critical */ });
    return () => { stopFn?.(); };
  }, []);

  // iOS Companion: listen for commands from iOS and route through Jose
  useEffect(() => {
    if (typeof window.__TAURI_INTERNALS__ === 'undefined') return;
    let unlistenCommand: (() => void) | null = null;
    let unlistenApprove: (() => void) | null = null;
    let unlistenAbort: (() => void) | null = null;
    let registered = false;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');
        const { isJoseIntakeCommand, runJoseCommandExecutionPipeline } = await import('./services/joseExecutionEngineService');
        const { shouldRouteThroughJose } = await import('./lib/chatUtils');

        // Track active pipeline AbortControllers by commandId for abort_command
        const activeAborts = new Map<string, AbortController>();

        unlistenCommand = await listen('companion://command', async (event) => {
          const { commandId, text } = event.payload as { commandId: string; text: string };
          const abortCtrl = new AbortController();
          activeAborts.set(commandId, abortCtrl);
          try {
            const joseCommand = isJoseIntakeCommand(text) || shouldRouteThroughJose(text);
            if (!joseCommand) {
              await invoke('companion_broadcast', {
                event: 'done',
                payload: { commandId, error: 'Command not recognized as a Jose command.' }
              });
              return;
            }

            const result = await runJoseCommandExecutionPipeline({
              commandText: text,
              source: 'ios_companion',
              endpoint: settings.endpoint,
              zeroCostMode: settings.zeroCostMode,
              previewMode: false,
              conversationHistory: [],
              onProgress: (progress) => {
                if (abortCtrl.signal.aborted) return;
                invoke('companion_broadcast', {
                  event: 'agent_status',
                  payload: {
                    commandId,
                    agent: progress.assignment?.agent || 'jose',
                    status: progress.stage,
                    detail: progress.stage === 'wave_start'
                      ? `Wave ${(progress as any).wave + 1}: ${(progress as any).agents?.join(', ')}`
                      : progress.stage === 'executed'
                        ? `${(progress as any).assignment?.agent || 'Agent'} completed`
                        : 'Processing...'
                  }
                }).catch(() => {});
              },
              onToken: (tokenData) => {
                if (abortCtrl.signal.aborted) return;
                invoke('companion_broadcast', {
                  event: 'token',
                  payload: { commandId, token: tokenData.fullText || '' }
                }).catch(() => {});
              }
            });

            if (!abortCtrl.signal.aborted) {
              const summary = result?.command?.userReport?.summary || 'Command processed.';
              await invoke('companion_broadcast', {
                event: 'done',
                payload: { commandId, summary }
              });
            }
          } catch (err) {
            if (!abortCtrl.signal.aborted) {
              await invoke('companion_broadcast', {
                event: 'done',
                payload: { commandId, error: String(err) }
              }).catch(() => {});
            }
          } finally {
            activeAborts.delete(commandId);
          }
        });

        // abort_command: Rust emits companion://abort — cancel the pipeline for that commandId
        unlistenAbort = await listen('companion://abort', (event) => {
          const { commandId } = event.payload as { commandId: string };
          activeAborts.get(commandId)?.abort();
          activeAborts.delete(commandId);
          invoke('companion_broadcast', {
            event: 'done',
            payload: { commandId, error: 'Aborted by user.' }
          }).catch(() => {});
        });

        // Listen for approval requests from iOS — open the ApprovalModal
        unlistenApprove = await listen('companion://approve', async (event) => {
          const { taskId } = event.payload as { taskId: string };
          setApprovalPending(taskId);
        });

        registered = true;
      } catch { /* Tauri API not available */ }
    })();
    return () => {
      if (registered) {
        try { unlistenCommand?.(); } catch { /* ignore */ }
        try { unlistenApprove?.(); } catch { /* ignore */ }
        try { unlistenAbort?.(); } catch { /* ignore */ }
      }
    };
  }, [settings.endpoint, settings.zeroCostMode]);

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
      <UpdaterNotification
        version={updaterVersion}
        onUpdate={() => {
          if (updaterDownloadUrl) {
            invoke('open_url', { url: updaterDownloadUrl }).catch(() => {
              window.open(updaterDownloadUrl, '_blank', 'noopener,noreferrer');
            });
          }
        }}
        onDismiss={() => setUpdaterVersion(null)}
      />
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
            action={approvalPending}
            connector={undefined}
            riskLevel={undefined}
            mariaScore={undefined}
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
          <CommandRib activeTab={activeTab} settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} />
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
                  <MissionRoomBoardroomTabs onCreateApprovalRequest={() => setApprovalRequiredNotice(true)} />
                )}
                {activeTab === 'chat' && (
                  <Suspense fallback={<ViewLoadingState activeTab="Chat" />}>
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
                  <EcosystemHub settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} verificationLogs={verificationLogs} voiceStatus={voice.voiceStatus} workspaceFoundation={workspaceFoundation} updateCheckState={updateCheckState} nativeSelfDevProof={nativeSelfDevProof} setNativeSelfDevProof={setNativeSelfDevProof} nativeProofHooks={nativeProofHooks} />
                )}
                {activeTab === 'project_execution' && <ProjectExecutionMode />}
                {activeTab === 'orchestrator' && (
                  <OrchestratorView settings={settings} ollamaStatus={ollamaStatus} onJoseStateChange={(state: string, message: string) => setJoseCompanionState({ state, message })} />
                )}
                {activeTab === 'operator' && (
                  <OperatorDashboard operatorMode={operatorMode} setOperatorMode={setOperatorMode} ollamaStatus={ollamaStatus} lastCheckedAt={lastCheckedAt} verificationLogs={verificationLogs} onVerifyOllama={verifyOllamaWithProof} onVerifyAuditChain={verifyAuditChain} onVerifyProcess={verifyProcesses} onVerifyPaths={verifyPaths} onVerifyCommand={verifyCommand} memoryItems={memoryItems} plugins={plugins} diskPluginManifests={diskPluginManifests} pluginAudit={pluginAudit} onTogglePlugin={handleTogglePlugin} onDiscoverPlugins={handleDiscoverPlugins} workspaceFoundation={workspaceFoundation} onToggleWorkspaceFeature={handleToggleWorkspaceFeature} workspaceProof={workspaceProof} ocrCapability={ocrCapability} onRunWorkspaceProof={handleRunWorkspaceProof} onCheckOcrCapability={handleCheckOcrCapability} workspaceSymbolIndex={workspaceSymbolIndex} onBuildSymbolIndex={handleBuildSymbolIndex} onExecutePluginTool={handleExecutePluginTool} onValidatePluginManifest={handleValidatePluginManifest} lastPluginToolRun={lastPluginToolRun} lastManifestValidation={lastManifestValidation} pluginSandboxPolicy={pluginSandboxPolicy} onUpdatePluginSandboxPolicy={handleUpdatePluginSandboxPolicy} auditChainProof={auditChainProof} onRunOcrAdapter={handleRunOcrAdapter} lastOcrAdapterRun={lastOcrAdapterRun} snapshots={snapshots} onCreateSnapshot={handleCreateSnapshot} onRestoreSnapshot={handleRestoreSnapshot} onBackupMemory={handleBackupMemory} onRunRuntimeRepair={handleRuntimeRepair} onRunReleasePreflight={handleRunReleasePreflight} onExportDiagnostics={handleExportDiagnostics} durableAuditLogs={durableAuditLogs} coachMode={coachMode} coachAlwaysOnTop={coachAlwaysOnTop} onToggleCoachMode={handleToggleCoachMode} onToggleCoachTop={handleToggleCoachTop} screenObserverState={screenObserverState} screenObserverLogs={screenObserverLogs} onRequestScreenObserverPermission={handleRequestScreenObserverPermission} onStartScreenObserver={handleStartScreenObserver} onStopScreenObserver={handleStopScreenObserver} onUpdateScreenObserverSettings={handleUpdateScreenObserverSettings} modes={settings} />
                )}
                {activeTab === 'settings' && (
                  <Suspense fallback={null}>
                    <SettingsView settings={settings} setSettings={setSettings} ollamaStatus={ollamaStatus} installedModels={installedModels} selectedModelMissing={selectedModelMissing} onCheckOllama={runOllamaCheck} onCopyTroubleshootingCommand={copyTroubleshootingCommand} copyState={copyState} updateCheckState={updateCheckState} onCheckUpdates={checkAppUpdate} normalizeEndpoint={(e: string) => e} ollamaTroubleshootingCommand="ollama" braveSearchConfigured={braveSearchConfigured} memoryItems={memoryItems} />
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
        <RightPanel settings={settings} ollamaStatus={ollamaStatus} installedModels={installedModels} desktopBridge={desktopBridge} voiceStatus={voice.voiceStatus} selectedModelMissing={selectedModelMissing} lastCheckedAt={lastCheckedAt} onCheckOllama={runOllamaCheck} onCopyTroubleshootingCommand={copyTroubleshootingCommand} copyState={copyState} onMinimizeToCoach={minimizeToCoach} operatorMode={operatorMode} approvalRequiredNotice={approvalRequiredNotice} miyaCompanionState={miyaCompanionState} joseCompanionState={joseCompanionState} hectorCompanionState={hectorCompanionState} screenObserverState={screenObserverState} updateCheckState={updateCheckState} onCheckUpdates={checkAppUpdate} agentDockCompanions={mergedAgentDockCompanions} />
      </Suspense>
      <Suspense fallback={null}>
        <BootStatusBanner />
      </Suspense>
      {showWorkflowPanel && (
        <Suspense fallback={<ViewLoadingState activeTab="Workflows" />}>
          <WorkflowPanel onClose={() => setShowWorkflowPanel(false)} onRunWorkflow={(_workflowId: string) => switchTab('activity')} />
        </Suspense>
      )}
      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} />
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
