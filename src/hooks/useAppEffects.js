import { useBootEffects } from './useBootEffects';
import { usePersistenceEffects } from './usePersistenceEffects';
import { useSessionEffects } from './useSessionEffects';
import { useNativeProofEffects } from './useNativeProofEffects';
import { useDataHydration } from './useDataHydration';
import { usePollingEffects } from './usePollingEffects';
import { useTrayEffects } from './useTrayEffects';

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
  useBootEffects({
    settings,
    setSettings,
    setConversations,
    setActiveChatId,
    setDesktopBridge,
    setIsOnline
  });

  usePersistenceEffects({
    settings,
    conversations,
    nativeSelfDevProof,
    coachMiniMode,
    coachSnapCorner
  });

  useSessionEffects({
    isCoachWindow,
    activeTab,
    ollamaStatus,
    approvalRequiredNotice,
    prevOllamaStateRef,
    toast,
    setCoachIntervention,
    setCoachMiniMode,
    setCoachMode,
    setJoseCompanionState
  });

  useNativeProofEffects({
    settings,
    desktopBridge,
    updateCheckState,
    workspaceFoundation,
    nativeProofHooks,
    writeNativeProofStage,
    nativeSelfDevAutorunRef,
    setNativeSelfDevProof
  });

  useDataHydration({
    settings,
    desktopBridge,
    isCoachWindow,
    setVerificationLogs,
    setDurableAuditLogs,
    setDiskPluginManifests,
    setMemoryItems,
    setPlugins,
    setPluginAudit
  });

  usePollingEffects({
    settings,
    desktopBridge,
    isCoachWindow,
    operatorMode,
    toast,
    updateCheckState,
    setUpdateCheckState,
    setVerificationLogs,
    setDurableAuditLogs,
    setBraveSearchConfigured,
    screenObserverRunRef
  });

  useTrayEffects({
    settings,
    coachMode,
    coachAlwaysOnTop,
    approvalRequiredNotice,
    setApprovalRequiredNotice,
    setCoachMode,
    setLastTaskCompletedAt,
    setVerificationLogs,
    createNewChat,
    voice
  });
}
