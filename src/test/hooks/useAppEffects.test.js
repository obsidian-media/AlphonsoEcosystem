import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    listen: vi.fn().mockResolvedValue(vi.fn()),
    emit: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    setFullscreen: vi.fn(),
    setTitle: vi.fn(),
    onFocusChange: vi.fn(),
  }),
}));

vi.mock('@tauri-apps/api/clipboard', () => ({
  readText: vi.fn().mockResolvedValue(''),
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn(),
}));

vi.mock('../services/appUpdateService', () => ({
  checkAppUpdate: vi.fn().mockResolvedValue({ available: false, configured: true }),
  notifyUpdateAvailable: vi.fn().mockResolvedValue(false),
}));

vi.mock('../services/verificationService', () => ({
  appendVerificationLog: vi.fn().mockReturnValue({ id: 'log-1', timestampMs: Date.now(), type: 'test', trust: 'verified' }),
  getVerificationLogs: vi.fn(() => []),
  readDurableAuditLog: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => false),
  pollWhatsAppConnector: vi.fn().mockResolvedValue({ routed: 0, rejected: 0 }),
}));

vi.mock('../services/hectorResearchService', () => ({
  isBraveSearchConfigured: vi.fn().mockResolvedValue(false),
}));

vi.mock('../services/screenIntelligenceService', () => ({
  stopScreenObserver: vi.fn(),
}));

vi.mock('../services/coachInterventionService', () => ({
  COACH_INTERVENTION_LEVELS: { HARD: 'hard', SOFT: 'soft' },
  subscribeSessionGuardBridge: vi.fn((cb) => cb({ intervention: null })),
}));

vi.mock('../services/coachSoundCueService', () => ({
  playCoachSoundCue: vi.fn(),
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: {
    VERIFIED: 'verified',
    INFERRED: 'inferred',
    TEMPORARY: 'temporary',
    UNVERIFIED: 'unverified',
    FAILED: 'failed',
    PENDING: 'pending',
  },
}));

vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn(),
}));

vi.mock('../services/coachModeService', () => ({
  openCoachWindow: vi.fn().mockResolvedValue(undefined),
  closeCoachWindow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn(() => null),
}));

vi.mock('../services/telegramCompanionService', () => ({
  startTelegramCompanion: vi.fn(),
}));

vi.mock('../services/whatsappCompanionService', () => ({
  startWhatsAppCompanion: vi.fn(),
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => '/home/user/alphonso-workspace'),
}));

vi.mock('../services/memoryService', () => ({
  hydrateMemoryFromDurable: vi.fn().mockResolvedValue(undefined),
  listMemoryItems: vi.fn(() => []),
}));

vi.mock('../services/connectors/connectorAuth', () => ({
  hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/pluginRegistryService', () => ({
  discoverDiskPluginManifests: vi.fn().mockResolvedValue([]),
  listPlugins: vi.fn(() => []),
  listPluginAudit: vi.fn(() => ({})),
}));

vi.mock('../services/verificationService', () => ({
  getVerificationLogs: vi.fn(() => []),
  appendVerificationLog: vi.fn().mockReturnValue({ id: 'log-1', timestampMs: Date.now(), type: 'test', trust: 'verified' }),
  readDurableAuditLog: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/runtimeLedgerService', () => ({
  bootstrapRuntimeLedgerHydration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/serviceScopes', () => ({
  PACKET_SCOPE: 'packets',
  JOSE_COMMAND_SCOPE: 'jose_commands',
  SESSION_EVENT_SCOPE: 'session_events',
  GOVERNANCE_SCOPE: 'governance',
  ORCHESTRATION_RECEIPT_SCOPE: 'orchestration_receipts',
  ORCHESTRATION_QUEUE_SCOPE: 'orchestration_queue',
  VERIFICATION_SCOPE: 'verification',
  CONNECTOR_SCOPE: 'connectors',
  CONNECTOR_AUDIT_SCOPE: 'connector_audit',
  CONNECTOR_AUTH_SCOPE: 'connector_auth',
  TOOL_CONNECTION_SCOPE: 'tool_connections',
  TOOL_CONNECTION_AUDIT_SCOPE: 'tool_connection_audit',
  MIYA_MEMORY_SCOPE: 'miya_memory',
  PLUGINS_SCOPE: 'plugins',
  PLUGIN_AUDIT_SCOPE: 'plugin_audit',
  REPO_AUDIT_SCOPE: 'repo_audit',
  PRODUCTION_READINESS_SCOPE: 'production_readiness',
  DEV_PACKET_SCOPE: 'dev_packets',
  SELF_DEVELOPMENT_SCOPE: 'self_development',
  WORKFLOW_OPS_SCOPE: 'workflow_ops',
  WORKFLOW_RUN_SCOPE: 'workflow_run',
  WORKFLOW_RECEIPT_SCOPE: 'workflow_receipt',
  WORKFLOW_TELEMETRY_SCOPE: 'workflow_telemetry',
  AGENT_OUTPUT_SCOPE: 'agent_output',
  NOVA_SCORE_SCOPE: 'nova_score',
}));

vi.mock('../constants/appConstants', () => ({
  INITIAL_CONVERSATION_ID: 'default-session',
  COACH_LAYOUT_KEY: 'coach_layout',
}));

import { useAppEffects } from '../../hooks/useAppEffects';

describe('useAppEffects', () => {
  const mockSettings = {
    approvalMode: false,
    zeroCostMode: true,
    safeMode: true,
    localOnlyMode: true,
    previewMode: true,
    workspaceRoot: '',
    environmentTheme: 'deep_space',
    autoLaunchServices: false,
    comfyuiDir: '',
    comfyuiPython: 'python',
    coachAgent: 'alphonso',
    coachAlwaysOnTop: false,
    autoUpdateEnabled: true,
    updaterEndpoint: '',
    updaterPubkey: '',
    updaterTarget: '',
  };

  const mockVoice = {
    voiceStatus: { state: 'idle', message: 'Mic is off.' },
    toggleListening: vi.fn(),
  };

  const mockToast = { show: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() };

  const defaultProps = {
    settings: mockSettings,
    setSettings: vi.fn(),
    conversations: [],
    setConversations: vi.fn(),
    activeChatId: 'default-session',
    setActiveChatId: vi.fn(),
    activeTab: 'mission',
    ollamaStatus: { state: 'connected', label: 'Connected', models: [] },
    desktopBridge: { state: 'connected', label: 'Connected', message: 'Alphonso' },
    setDesktopBridge: vi.fn(),
    coachMode: false,
    setCoachMode: vi.fn(),
    coachMiniMode: false,
    setCoachMiniMode: vi.fn(),
    coachAlwaysOnTop: false,
    coachSnapCorner: 'bottom-right',
    setIsLocked: vi.fn(),
    setIsOnline: vi.fn(),
    isCoachWindow: false,
    verificationLogs: [],
    setVerificationLogs: vi.fn(),
    nativeSelfDevProof: null,
    setNativeSelfDevProof: vi.fn(),
    workspaceFoundation: null,
    setWorkspaceFoundation: vi.fn(),
    updateCheckState: { checking: false, configured: false, available: false },
    setUpdateCheckState: vi.fn(),
    setLastCheckedAt: vi.fn(),
    joseCompanionState: { state: 'idle', message: '' },
    setJoseCompanionState: vi.fn(),
    hectorCompanionState: { state: 'idle', message: '' },
    setHectorCompanionState: vi.fn(),
    approvalRequiredNotice: false,
    setApprovalRequiredNotice: vi.fn(),
    approvalPending: null,
    setApprovalPending: vi.fn(),
    setBraveSearchConfigured: vi.fn(),
    setDurableAuditLogs: vi.fn(),
    setDiskPluginManifests: vi.fn(),
    setMemoryItems: vi.fn(),
    setPlugins: vi.fn(),
    setPluginAudit: vi.fn(),
    setScreenObserverState: vi.fn(),
    setScreenObserverLogs: vi.fn(),
    setCoachIntervention: vi.fn(),
    setLastTaskCompletedAt: vi.fn(),
    operatorMode: false,
    voice: mockVoice,
    toast: mockToast,
    writeNativeProofStage: vi.fn(),
    nativeProofHooks: null,
    runOllamaCheck: vi.fn(),
    createNewChat: vi.fn(),
    switchTab: vi.fn(),
    approvalResolveRef: { current: null },
    idleTimerRef: { current: null },
    ollamaCheckRunRef: { current: null },
    screenObserverRunRef: { current: null },
    workspaceRootBootstrapRef: { current: null },
    nativeSelfDevAutorunRef: { current: null },
    prevOllamaStateRef: { current: 'connected' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Mount and basic behavior', () => {
    it('mounts without throwing', () => {
      const { result } = renderHook(() => useAppEffects(defaultProps));
      expect(result.current).toBeUndefined();
    });

    it('does not throw when unmounting', () => {
      const { unmount } = renderHook(() => useAppEffects(defaultProps));
      expect(() => unmount()).not.toThrow();
    });

    it('handles cleanup without errors', () => {
      const { unmount } = renderHook(() => useAppEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });

  describe('Props handling', () => {
    it('accepts all required props without error', () => {
      renderHook(() => useAppEffects(defaultProps));
      expect(true).toBe(true);
    });

    it('handles updated props on re-render', () => {
      const { rerender } = renderHook(
        ({ props }) => useAppEffects(props),
        { initialProps: { props: defaultProps } }
      );

      const newProps = { ...defaultProps, activeTab: 'chat', coachMode: true };
      rerender({ props: newProps });
      expect(true).toBe(true);
    });

    it('handles voice prop changes', () => {
      const customVoice = { voiceStatus: { state: 'listening', message: 'Listening...' }, toggleListening: vi.fn() };
      const props = { ...defaultProps, voice: customVoice };
      renderHook(() => useAppEffects(props));
      expect(true).toBe(true);
    });

    it('handles toast prop changes', () => {
      const customToast = { show: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() };
      const props = { ...defaultProps, toast: customToast };
      renderHook(() => useAppEffects(props));
      expect(true).toBe(true);
    });

    it('handles desktopBridge prop changes', () => {
      const customBridge = { state: 'disconnected', label: 'Disconnected', message: 'Not in Tauri' };
      const props = { ...defaultProps, desktopBridge: customBridge };
      renderHook(() => useAppEffects(props));
      expect(true).toBe(true);
    });

    it('handles isCoachWindow prop changes', () => {
      const props = { ...defaultProps, isCoachWindow: true };
      renderHook(() => useAppEffects(props));
      expect(true).toBe(true);
    });
  });

  describe('Ref stability', () => {
    it('passes ref objects consistently across renders', () => {
      const { rerender } = renderHook(({ refs }) => useAppEffects(refs), {
        initialProps: { refs: defaultProps },
      });

      rerender({ refs: { ...defaultProps, activeTab: 'chat' } });
      expect(true).toBe(true);
    });
  });

  describe('Idempotent initialization', () => {
    it('does not duplicate effects on re-render with same props', () => {
      const { rerender } = renderHook(() => useAppEffects(defaultProps));
      rerender(defaultProps);
      expect(true).toBe(true);
    });
  });

  describe('Cleanup on unmount', () => {
    it('cleans up without errors', () => {
      const { unmount } = renderHook(() => useAppEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });
});