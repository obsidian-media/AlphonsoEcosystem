import { useEffect, useRef } from 'react';
import { getName, getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  COACH_INTERVENTION_LEVELS,
  subscribeSessionGuardBridge
} from '../services/coachInterventionService';
import { playCoachSoundCue } from '../services/coachSoundCueService';
import { checkAppUpdate, notifyUpdateAvailable } from '../services/appUpdateService';
import { hydrateMemoryFromDurable, listMemoryItems } from '../services/memoryService';
import { discoverDiskPluginManifests, listPlugins, listPluginAudit } from '../services/pluginRegistryService';
import { listSnapshots } from '../services/recoveryService';
import { TRUST_STATES, timestampMs } from '../services/trustModel';
import { PROOF_AUTHORITY } from '../services/serviceScopes';
import { appendVerificationLog, getVerificationLogs, readDurableAuditLog, verifyOllamaRuntimeProof } from '../services/verificationService';
import { getWorkspaceFoundation, updateWorkspaceFoundation } from '../services/workspaceIntelligenceService';
import { getScreenObserverLogs, getScreenObserverState, startScreenObserver, stopScreenObserver, updateScreenObserverState } from '../services/screenIntelligenceService';
import { appendSessionEvent } from '../services/sessionIntelligenceService';
import { bootstrapRuntimeLedgerHydration } from '../services/runtimeLedgerService';
import { isConnectorAuthenticated, pollWhatsAppConnector } from '../services/connectorRegistryService';
import { isBraveSearchConfigured } from '../services/hectorResearchService';
import { getPluginSandboxPolicy } from '../services/pluginSandboxService';
import { getDefaultWorkspaceRoot } from '../services/workspaceRootService';
import { openCoachWindow, closeCoachWindow } from '../services/coachModeService';
import {
  PACKET_SCOPE,
  JOSE_COMMAND_SCOPE,
  SESSION_EVENT_SCOPE,
  GOVERNANCE_SCOPE,
  ORCHESTRATION_RECEIPT_SCOPE,
  ORCHESTRATION_QUEUE_SCOPE,
  VERIFICATION_SCOPE,
  CONNECTOR_SCOPE,
  CONNECTOR_AUDIT_SCOPE,
  CONNECTOR_AUTH_SCOPE,
  TOOL_CONNECTION_SCOPE,
  TOOL_CONNECTION_AUDIT_SCOPE,
  MIYA_MEMORY_SCOPE,
  PLUGINS_SCOPE,
  PLUGIN_AUDIT_SCOPE,
  REPO_AUDIT_SCOPE,
  PRODUCTION_READINESS_SCOPE,
  DEV_PACKET_SCOPE,
  SELF_DEVELOPMENT_SCOPE,
  WORKFLOW_OPS_SCOPE,
  WORKFLOW_RUN_SCOPE,
  WORKFLOW_RECEIPT_SCOPE,
  WORKFLOW_TELEMETRY_SCOPE,
  AGENT_OUTPUT_SCOPE,
  NOVA_SCORE_SCOPE
} from '../services/serviceScopes';
import { runSelfDevelopmentCycle } from '../services/selfDevelopmentService';
import { getStorage, setStorage } from '../lib/appStorage';
import { INITIAL_CONVERSATION_ID, COACH_LAYOUT_KEY } from '../constants/appConstants';

export function useAppEffects({
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
}) {
  const settingsHydratedRef = useRef(false);
  const conversationsHydratedRef = useRef(false);

  // Boot ready RAF check
  useEffect(() => {
    let cancelled = false;
    let rafTwo = 0;
    const rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        if (cancelled) return;
        if (document.querySelector('[data-alphonso-shell-ready="true"]')) {
          window.__ALPHONSO_BOOT_READY__?.()
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafOne);
      if (rafTwo) window.cancelAnimationFrame(rafTwo);
    };
  }, []);

  // Persistence: settings
  useEffect(() => {
    setStorage('alphonso_settings', settings);
    invoke('save_settings', { settingsJson: JSON.stringify(settings) }).catch(() => {});
  }, [settings]);

  // Persistence: conversations
  useEffect(() => {
    setStorage('alphonso_conversations', conversations);
    invoke('kv_set', { key: 'alphonso_conversations', value: JSON.stringify(conversations) }).catch(() => {});
  }, [conversations]);

  // Persistence: native selfdev proof
  useEffect(() => setStorage('alphonso_native_selfdev_proof', nativeSelfDevProof), [nativeSelfDevProof]);

  // Persistence: coach layout
  useEffect(() => setStorage(COACH_LAYOUT_KEY, { mini: coachMiniMode, corner: coachSnapCorner }), [coachMiniMode, coachSnapCorner]);

  // Session guard bridge subscription
  useEffect(() => subscribeSessionGuardBridge((bridgeEvent) => {
    setCoachIntervention(bridgeEvent.intervention);
    const level = bridgeEvent.intervention?.level;
    if (level === COACH_INTERVENTION_LEVELS.HARD) {
      setCoachMiniMode(false);
      setCoachMode(true);
    }
    if (level) {
      playCoachSoundCue(level);
    }
  }), []);

  // Hydrate settings from SQLite on first boot
  useEffect(() => {
    if (settingsHydratedRef.current) return;
    settingsHydratedRef.current = true;
    invoke('load_settings').then((json) => {
      if (!json) return;
      try {
        const saved = JSON.parse(json);
        if (saved && typeof saved === 'object') setSettings((current) => ({ ...current, ...saved }));
      } catch { /* ignore corrupt data */ }
    }).catch(() => {});
  }, []);

  // Hydrate conversations from SQLite on first boot
  useEffect(() => {
    if (conversationsHydratedRef.current) return;
    conversationsHydratedRef.current = true;
    invoke('kv_get', { key: 'alphonso_conversations' }).then((json) => {
      if (!json) return;
      try {
        const saved = JSON.parse(json);
        if (Array.isArray(saved) && saved.length > 0) {
          setConversations(saved);
          setActiveChatId(saved[0]?.id || INITIAL_CONVERSATION_ID);
        }
      } catch { /* ignore corrupt data */ }
    }).catch(() => {});
  }, []);

  // Workspace root bootstrap
  useEffect(() => {
    if (workspaceRootBootstrapRef.current) return;
    workspaceRootBootstrapRef.current = true;
    if (!settings.workspaceRoot) {
      setSettings((current) => (
        current.workspaceRoot
          ? current
          : { ...current, workspaceRoot: getDefaultWorkspaceRoot() }
      ));
    }
  }, [settings.workspaceRoot, setSettings]);

  // Zero cost mode default
  useEffect(() => {
    if (typeof settings.zeroCostMode !== 'boolean') {
      setSettings((current) => ({ ...current, zeroCostMode: true }));
    }
  }, [settings.zeroCostMode, setSettings]);

  // Neon studio theme fallback
  useEffect(() => {
    if (settings.environmentTheme === 'neon_studio') {
      setSettings((current) => ({
        ...current,
        environmentTheme: 'minimal_runtime'
      }));
    }
  }, [settings.environmentTheme, setSettings]);

  // Frontend loaded proof
  useEffect(() => {
    void writeNativeProofStage('04_frontend_loaded.json', {
      status: 'running',
      processId: null,
      workspaceRoot: settings.workspaceRoot || getDefaultWorkspaceRoot(),
      note: 'React frontend mounted in the native runtime.'
    });
  }, [settings.workspaceRoot, writeNativeProofStage]);

  // Native self-development proof autorun
  useEffect(() => {
    let cancelled = false;

    if (window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__) {
      return () => {
        cancelled = true;
      };
    }

    async function runNativeSelfDevelopmentProof() {
      if (nativeSelfDevAutorunRef.current) return;

      const proofWorkspaceRoot = settings.workspaceRoot || getDefaultWorkspaceRoot();
      let rc0ProofValue = null;
      try {
        const rc0Proof = await invoke('read_runtime_env_value', { name: 'ALPHONSO_RC0_PROOF' });
        rc0ProofValue = String(rc0Proof?.value || '').trim();
      } catch {
        rc0ProofValue = null;
      }
      if (rc0ProofValue === '1') {
        nativeSelfDevAutorunRef.current = true;
        window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = true;
        if (!cancelled) {
          setNativeSelfDevProof({
            runtime: 'native_tauri',
            proofAuthority: PROOF_AUTHORITY.RUST_ENGINE,
            proofMode: 'native_rc0_rust',
            autorun: false,
            state: 'partial',
            workspaceRoot: proofWorkspaceRoot,
            workspaceRootValid: null,
            filesScanned: 0,
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            exportPath: null,
            proofReceiptsWritten: false,
            timestampMs: timestampMs(),
            note: 'Rust RC0 engine is proof authority. Verify release/rc0/proof/*.json on disk; React display is not proof.'
          });
        }
        return;
      }

      nativeSelfDevAutorunRef.current = true;
      window.__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = true;
      await writeNativeProofStage('05_autorun_observer_started.json', {
        status: 'running',
        workspaceRoot: proofWorkspaceRoot,
        note: 'Native autorun observer entered before env reads; React is not proof authority.'
      });

      let autorunValue = null;
      let exitValue = null;
      try {
        const autorunProof = await invoke('read_runtime_env_value', { name: 'ALPHONSO_SELFDEV_AUTORUN' });
        autorunValue = String(autorunProof?.value || '').trim();
      } catch {
        autorunValue = null;
      }
      try {
        const exitProof = await invoke('read_runtime_env_value', { name: 'ALPHONSO_SELFDEV_EXIT_ON_COMPLETE' });
        exitValue = String(exitProof?.value || '').trim();
      } catch {
        exitValue = null;
      }
      await writeNativeProofStage('05_autorun_observer_env_checked.json', {
        status: autorunValue === '1' ? 'ready' : 'setup_required',
        workspaceRoot: proofWorkspaceRoot,
        note: autorunValue === '1'
          ? 'Autorun env detected by the native proof observer.'
          : 'Autorun env not enabled or not readable in the native proof observer.',
        autorunValue: autorunValue === '1',
        exitValue: exitValue === '1'
      });

      if (autorunValue !== '1') {
        if (!cancelled) {
          setNativeSelfDevProof({
            runtime: 'native_tauri',
            proofMode: 'automated_native',
            autorun: false,
            state: 'setup_required',
            workspaceRoot: proofWorkspaceRoot,
            workspaceRootValid: null,
            filesScanned: 0,
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            exportPath: null,
            proofReceiptsWritten: false,
            timestampMs: timestampMs(),
            note: 'ALPHONSO_SELFDEV_AUTORUN is not enabled in this native runtime.'
          });
          await invoke('write_workspace_text_file', {
            workspaceRoot: proofWorkspaceRoot,
            relativePath: 'release/rc0/native-selfdev-skipped.json',
            content: JSON.stringify({
              runtime: 'native_tauri',
              proofMode: 'automated_native',
              state: 'setup_required',
              autorun: false,
              workspaceRoot: proofWorkspaceRoot,
              timestampMs: timestampMs(),
              note: 'ALPHONSO_SELFDEV_AUTORUN is not enabled in this native runtime.'
            }, null, 2)
          }).catch(() => {});
        }
        return;
      }

      if (!cancelled) {
        setNativeSelfDevProof({
          runtime: 'native_tauri',
          proofMode: 'automated_native',
          autorun: true,
          state: 'running',
          workspaceRoot: settings.workspaceRoot || getDefaultWorkspaceRoot(),
          workspaceRootValid: null,
          filesScanned: 0,
          p0Count: 0,
          p1Count: 0,
          p2Count: 0,
          exportPath: null,
          proofReceiptsWritten: false,
          timestampMs: timestampMs(),
          note: exitValue === '1' ? 'Native proof will exit after completion if safe.' : 'Native proof will leave the app open after completion.'
        });
        await invoke('write_workspace_text_file', {
          workspaceRoot: proofWorkspaceRoot,
          relativePath: 'release/rc0/native-selfdev-started.json',
          content: JSON.stringify({
            runtime: 'native_tauri',
            state: 'running',
            autorun: true,
            workspaceRoot: proofWorkspaceRoot,
            timestampMs: timestampMs(),
            exitOnComplete: exitValue === '1'
          }, null, 2)
        }).catch(() => {});
      }

      try {
        await writeNativeProofStage('05_autorun_observer_triggered.json', {
          status: 'running',
          workspaceRoot: proofWorkspaceRoot,
          note: 'Native autorun observer branch reached before workspace validation.'
        });
        const cycle = await runSelfDevelopmentCycle({
          root: proofWorkspaceRoot,
          settings,
          updateCheckState,
          verificationLogs,
          workspaceFoundation,
          proofHooks: nativeProofHooks
        });
        if (cancelled) return;
        const nextProof = {
          runtime: 'native_tauri',
          proofAuthority: PROOF_AUTHORITY.JS_BRIDGE,
          proofMode: 'automated_native',
          autorun: true,
          state: 'partial',
          workspaceRoot: cycle?.root || settings.workspaceRoot || getDefaultWorkspaceRoot(),
          workspaceRootValid: Boolean(cycle?.validation?.ok),
          filesScanned: Number(cycle?.auditSummary?.filesScanned || 0),
          p0Count: Number(cycle?.auditSummary?.blockerCount || 0),
          p1Count: Number(cycle?.readinessSummary?.partialCount || 0),
          p2Count: Number(cycle?.readinessSummary?.needsSetupCount || 0),
          topPackets: Array.isArray(cycle?.packets) ? cycle.packets.slice(0, 10).map((packet) => ({
            id: packet.id,
            title: packet.title,
            priority: packet.priority,
            riskLevel: packet.riskLevel
          })) : [],
          exportPath: cycle?.exportProof?.file_path || cycle?.exportProof?.filePath || null,
          proofReceiptsWritten: false,
          rc0Proof: cycle?.rc0Proof || null,
          timestampMs: cycle?.generatedAtMs || timestampMs(),
          note: cycle?.rc0Error
            ? `JS bridge RC0 export error: ${cycle.rc0Error}`
            : 'JS bridge scan recorded. Rust RC0 engine and release/rc0/proof/*.json remain proof authority.'
        };
        setNativeSelfDevProof(nextProof);
        await invoke('write_workspace_text_file', {
          workspaceRoot: proofWorkspaceRoot,
          relativePath: 'release/rc0/native-selfdev-complete.json',
          content: JSON.stringify(nextProof, null, 2)
        }).catch(() => {});
      } catch (error) {
        if (!cancelled) {
          const failedProof = {
            runtime: 'native_tauri',
            proofMode: 'automated_native',
            autorun: true,
            state: 'failed',
            workspaceRoot: proofWorkspaceRoot,
            workspaceRootValid: false,
            filesScanned: 0,
            p0Count: 0,
            p1Count: 0,
            p2Count: 0,
            exportPath: null,
            proofReceiptsWritten: false,
            timestampMs: timestampMs(),
            error: String(error)
          };
          setNativeSelfDevProof(failedProof);
          await invoke('write_workspace_text_file', {
            workspaceRoot: proofWorkspaceRoot,
            relativePath: 'release/rc0/native-selfdev-error.json',
            content: JSON.stringify(failedProof, null, 2)
          }).catch(() => {});
        }
      }
    }

    void runNativeSelfDevelopmentProof();
    return () => {
      cancelled = true;
    };
  }, [desktopBridge.state, nativeProofHooks, settings.workspaceRoot, updateCheckState, verificationLogs, workspaceFoundation]);

  // Online/offline listener
  useEffect(() => {
    const go  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  go);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', off); };
  }, [setIsOnline]);

  // Session lifecycle events
  useEffect(() => {
    appendSessionEvent({
      category: 'app_lifecycle',
      title: 'Alphonso app session started',
      details: { runtime: isCoachWindow ? 'coach_window' : 'main_window' },
      agent: 'alphonso',
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED
    });

    const onBeforeUnload = () => {
      appendSessionEvent({
        category: 'app_lifecycle',
        title: 'Alphonso app window closing',
        details: { runtime: isCoachWindow ? 'coach_window' : 'main_window' },
        agent: 'alphonso',
        confidence: TRUST_STATES.TEMPORARY,
        verificationState: TRUST_STATES.UNVERIFIED
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isCoachWindow]);

  // Agent switch events
  useEffect(() => {
    appendSessionEvent({
      category: 'agent_switch',
      title: `Active workspace switched to ${activeTab}`,
      details: { activeTab },
      agent: activeTab === 'miya' ? 'miya' : activeTab === 'orchestrator' ? 'jose' : activeTab === 'hector' ? 'hector' : 'alphonso',
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED
    });
  }, [activeTab]);

  // Ollama runtime state events
  useEffect(() => {
    appendSessionEvent({
      category: 'runtime',
      title: `Ollama runtime state: ${ollamaStatus.state}`,
      details: { state: ollamaStatus.state, label: ollamaStatus.label },
      agent: 'alphonso',
      confidence: ollamaStatus.trust || TRUST_STATES.TEMPORARY,
      verificationState: ollamaStatus.trust || TRUST_STATES.UNVERIFIED
    });
  }, [ollamaStatus.state, ollamaStatus.label, ollamaStatus.trust]);

  // Ollama state change toasts
  useEffect(() => {
    const prev = prevOllamaStateRef.current;
    const curr = ollamaStatus.state;
    prevOllamaStateRef.current = curr;
    const wasConnected = prev === 'connected';
    const isDisconnected = ['not_running', 'cors', 'timeout', 'disconnected', 'error'].includes(curr);
    const isNowConnected = curr === 'connected';
    if (wasConnected && isDisconnected) {
      toast.error('Ollama disconnected', 'Retrying automatically. Check that Ollama is running.');
    } else if (!wasConnected && isNowConnected && prev !== 'connecting') {
      toast.success('Ollama reconnected', `Connected to ${ollamaStatus.models?.length ?? 0} model(s).`);
    }
  }, [ollamaStatus.state, toast, ollamaStatus.models?.length]);

  // Update available toast
  useEffect(() => {
    if (updateCheckState.available && updateCheckState.latestVersion) {
      toast.info('Update available', `Alphonso ${updateCheckState.latestVersion} is ready — open Settings to install.`);
    }
  }, [updateCheckState.available, updateCheckState.latestVersion, toast]);

  // Jose companion state
  useEffect(() => {
    if (ollamaStatus.state !== 'connected' && ollamaStatus.state !== 'connecting') {
      setJoseCompanionState({ state: 'warning', message: 'Runtime attention required.' });
      return;
    }
    if (approvalRequiredNotice) {
      setJoseCompanionState({ state: 'approving', message: 'Approval queue needs review.' });
      return;
    }
    if (activeTab === 'orchestrator') {
      setJoseCompanionState({ state: 'thinking', message: 'Jose is reviewing the ecosystem.' });
      return;
    }
    setJoseCompanionState({ state: 'idle', message: 'Jose is coordinating quietly.' });
  }, [activeTab, approvalRequiredNotice, ollamaStatus.state, setJoseCompanionState]);

  // Desktop bridge inspection
  useEffect(() => {
    let cancelled = false;

    async function inspectDesktopBridge() {
      try {
        const [name, version] = await Promise.all([getName(), getVersion()]);
        if (!cancelled) {
          setDesktopBridge({
            state: 'connected',
            label: 'Connected',
            message: `${name || 'Alphonso'} ${version || ''}`.trim()
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDesktopBridge({
            state: 'disconnected',
            label: 'Browser preview',
            message: 'Tauri app APIs are not available in this runtime.'
          });
        }
      }
    }

    inspectDesktopBridge();
    return () => {
      cancelled = true;
    };
  }, [setDesktopBridge]);

  // Supervised state loading
  useEffect(() => {
    let cancelled = false;

    const loadSupervisedState = async () => {
      const [audit, manifests] = await Promise.all([
        readDurableAuditLog(200),
        discoverDiskPluginManifests(settings.workspaceRoot)
      ]);

      if (cancelled) return;
      setDurableAuditLogs(Array.isArray(audit) ? audit : []);
      setDiskPluginManifests(Array.isArray(manifests) ? manifests : []);
    };

    loadSupervisedState();
    return () => {
      cancelled = true;
    };
  }, [settings.workspaceRoot, setDurableAuditLogs, setDiskPluginManifests]);

  // Memory hydration from durable
  useEffect(() => {
    let cancelled = false;
    if (isCoachWindow) return undefined;

    const hydrate = async () => {
      const durableRows = await hydrateMemoryFromDurable();
      if (!cancelled && Array.isArray(durableRows) && durableRows.length) {
        setMemoryItems(durableRows);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [desktopBridge.state, isCoachWindow, setMemoryItems]);

  // Runtime ledger hydration
  useEffect(() => {
    let cancelled = false;
    if (isCoachWindow) return undefined;

    const hydrateRuntimeLedgers = async () => {
      const proof = await bootstrapRuntimeLedgerHydration([
        { scope: PACKET_SCOPE, storageKey: 'alphonso_agent_bus_packets_v1' },
        { scope: JOSE_COMMAND_SCOPE, storageKey: 'alphonso_jose_command_routes_v2' },
        { scope: SESSION_EVENT_SCOPE, storageKey: 'alphonso_session_events_v1' },
        { scope: GOVERNANCE_SCOPE, storageKey: 'alphonso_jose_governance_decisions_v1' },
        { scope: ORCHESTRATION_RECEIPT_SCOPE, storageKey: 'alphonso_orchestration_receipts_v1' },
        { scope: ORCHESTRATION_QUEUE_SCOPE, storageKey: 'alphonso_orchestration_queue_transitions_v1' },
        { scope: VERIFICATION_SCOPE, storageKey: 'alphonso_verification_logs_v1' },
        { scope: CONNECTOR_SCOPE, storageKey: 'alphonso_connector_registry_v2' },
        { scope: CONNECTOR_AUDIT_SCOPE, storageKey: 'alphonso_connector_audit_v2' },
        { scope: CONNECTOR_AUTH_SCOPE, storageKey: 'alphonso_connector_auth_profiles_v1' },
        { scope: TOOL_CONNECTION_SCOPE, storageKey: 'alphonso_tool_connections_v1' },
        { scope: TOOL_CONNECTION_AUDIT_SCOPE, storageKey: 'alphonso_tool_connection_audit_v1' },
        { scope: MIYA_MEMORY_SCOPE, storageKey: 'alphonso_miya_memory_v1' },
        { scope: PLUGINS_SCOPE, storageKey: 'alphonso_plugins_v1' },
        { scope: PLUGIN_AUDIT_SCOPE, storageKey: 'alphonso_plugin_audit_v1' },
        { scope: REPO_AUDIT_SCOPE, storageKey: 'alphonso_repo_audits_v1' },
        { scope: PRODUCTION_READINESS_SCOPE, storageKey: 'alphonso_production_readiness_v1' },
        { scope: DEV_PACKET_SCOPE, storageKey: 'alphonso_dev_packets_v1' },
        { scope: SELF_DEVELOPMENT_SCOPE, storageKey: 'alphonso_self_development_cycles_v1' },
        { scope: WORKFLOW_OPS_SCOPE, storageKey: 'alphonso_workflow_operations_registry_v1' },
        { scope: WORKFLOW_RUN_SCOPE, storageKey: 'alphonso_workflow_runs_v1' },
        { scope: WORKFLOW_RECEIPT_SCOPE, storageKey: 'alphonso_workflow_receipts_v1' },
        { scope: WORKFLOW_TELEMETRY_SCOPE, storageKey: 'alphonso_workflow_telemetry_v1' },
        { scope: AGENT_OUTPUT_SCOPE, storageKey: 'alphonso_agent_outputs_v1' },
        { scope: NOVA_SCORE_SCOPE, storageKey: 'alphonso_nova_scores_v1' }
      ]);
      if (cancelled || !proof?.available) return;
      setVerificationLogs(getVerificationLogs());
      setPlugins(listPlugins());
      setPluginAudit(listPluginAudit());
      setMemoryItems(listMemoryItems());
    };

    hydrateRuntimeLedgers();
    return () => {
      cancelled = true;
    };
  }, [desktopBridge.state, isCoachWindow, setVerificationLogs, setPlugins, setPluginAudit, setMemoryItems]);

  // Update check callback and interval
  useEffect(() => {
    if (!settings.autoUpdateEnabled || isCoachWindow || desktopBridge.state !== 'connected') return undefined;

    const runUpdateCheck = async ({ manual = false } = {}) => {
      if (!settings.autoUpdateEnabled && !manual) return;

      setUpdateCheckState((current) => ({
        ...current,
        checking: true
      }));

      const proof = await checkAppUpdate({
        endpoint: settings.updaterEndpoint,
        pubkey: settings.updaterPubkey,
        target: settings.updaterTarget
      });

      const notificationSent = proof.available ? await notifyUpdateAvailable(proof) : false;
      setUpdateCheckState({
        checking: false,
        configured: Boolean(proof.configured),
        available: Boolean(proof.available),
        latestVersion: proof.latestVersion || null,
        currentVersion: proof.currentVersion || '',
        notes: proof.notes || null,
        pubDate: proof.pubDate || null,
        downloadUrl: proof.downloadUrl || null,
        checkedAtMs: proof.checkedAtMs || Date.now(),
        trust: proof.trust || TRUST_STATES.UNVERIFIED,
        error: proof.error || null,
        notificationSent
      });

      const trust = proof.available ? TRUST_STATES.VERIFIED : (proof.configured ? TRUST_STATES.INFERRED : TRUST_STATES.UNVERIFIED);
      const log = appendVerificationLog({
        type: 'app_update_check',
        source: 'tauri-updater-runtime',
        trust,
        payload: {
          configured: Boolean(proof.configured),
          available: Boolean(proof.available),
          latestVersion: proof.latestVersion || null,
          error: proof.error || null
        }
      });
      setVerificationLogs((current) => [...current, log].slice(-250));
    };

    runUpdateCheck({ manual: false });
    const intervalMs = 1000 * 60 * 30;
    const timer = window.setInterval(() => runUpdateCheck({ manual: false }), intervalMs);
    return () => window.clearInterval(timer);
  }, [desktopBridge.state, isCoachWindow, settings.autoUpdateEnabled, settings.updaterEndpoint, settings.updaterPubkey, settings.updaterTarget, setUpdateCheckState, setVerificationLogs]);

  // Screen observer cleanup
  useEffect(() => () => {
    if (screenObserverRunRef.current) {
      stopScreenObserver();
    }
  }, []);

  // Brave search config check
  useEffect(() => {
    if (isCoachWindow) return;
    isBraveSearchConfigured().then((configured) => setBraveSearchConfigured(configured)).catch(() => {});
  }, [isCoachWindow, setBraveSearchConfigured]);

  // WhatsApp connector polling
  useEffect(() => {
    if (isCoachWindow) return;
    let cancelled = false;
    let timeoutId = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        if (isConnectorAuthenticated('whatsapp')) {
          const result = await pollWhatsAppConnector(12);
          if (!cancelled && result?.routed > 0) {
            toast.info(
              `WhatsApp — ${result.routed} message${result.routed > 1 ? 's' : ''} routed to Jose`,
              `${result.rejected > 0 ? `${result.rejected} rejected (not on allowlist). ` : ''}Check Orchestrator for approvals.`
            );
          }
        }
      } catch { /* best-effort */ }
      if (!cancelled) {
        timeoutId = window.setTimeout(poll, 30000);
      }
    };

    timeoutId = window.setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isCoachWindow, toast]);

  // Operator mode audit refresh
  useEffect(() => {
    if (!operatorMode) return undefined;
    let cancelled = false;

    const refreshAudit = async () => {
      const logs = await readDurableAuditLog(200);
      if (!cancelled) {
        setDurableAuditLogs(Array.isArray(logs) ? logs : []);
      }
    };

    refreshAudit();
    const timer = window.setInterval(refreshAudit, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [operatorMode, setDurableAuditLogs]);

  // Last task completed timeout
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setLastTaskCompletedAt(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [setLastTaskCompletedAt]);

  // Approval required notice timeout
  useEffect(() => {
    if (!approvalRequiredNotice) return undefined;
    const timeoutId = window.setTimeout(() => setApprovalRequiredNotice(false), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [approvalRequiredNotice, setApprovalRequiredNotice]);

  // Tray menu listeners
  useEffect(() => {
    let unlistenTrayMenu;
    let unlistenCoachToggle;
    let disposed = false;

    const bindListeners = async () => {
      try {
        unlistenTrayMenu = await listen('alphonso://tray_menu', (event) => {
          const action = String(event.payload || 'unknown');
          const log = appendVerificationLog({
            type: 'tray_menu_event',
            source: 'tauri-tray',
            trust: TRUST_STATES.VERIFIED,
            payload: { action }
          });
          setVerificationLogs((current) => [...current, log].slice(-250));
        });

        await listen('alphonso://new_chat',    () => { if (!disposed) createNewChat(); });
        await listen('alphonso://voice_start', () => { if (!disposed) voice.toggleListening(); });

        unlistenCoachToggle = await listen('alphonso://coach_toggle', async () => {
          if (disposed) return;
          if (coachMode) {
            await closeCoachWindow();
            setCoachMode(false);
            return;
          }
          await openCoachWindow(coachAlwaysOnTop, settings.coachAgent || 'alphonso');
          setCoachMode(true);
        });
      } catch {
        // ignore outside Tauri runtime
      }
    };

    bindListeners();

    return () => {
      disposed = true;
      if (unlistenTrayMenu) unlistenTrayMenu();
      if (unlistenCoachToggle) unlistenCoachToggle();
    };
  }, [coachMode, coachAlwaysOnTop, settings.coachAgent, createNewChat, voice, setCoachMode, setVerificationLogs]);
}
