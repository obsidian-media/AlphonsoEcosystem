import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn(),
}));

vi.mock('../../services/memoryService', () => ({
  listMemoryItems: vi.fn(() => []),
  pushMemoryItem: vi.fn(),
}));

vi.mock('../../services/recoveryService', () => ({
  listSnapshots: vi.fn(() => []),
  createSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1', timestampMs: Date.now(), trust: 'verified', payload: {} }),
  restoreSnapshotById: vi.fn().mockReturnValue(null),
  backupMemoryLedger: vi.fn().mockReturnValue({ id: 'backup-1', items: [] }),
}));

vi.mock('../../services/verificationService', () => ({
  appendVerificationLog: vi.fn().mockReturnValue({ id: 'log-1', timestampMs: Date.now(), type: 'test', trust: 'verified' }),
  getVerificationLogs: vi.fn(() => []),
  readDurableAuditLog: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/screenIntelligenceService', () => ({
  getScreenObserverState: vi.fn(() => ({
    enabled: false,
    status: 'idle',
    permission: 'unknown',
    sampleEveryMs: 5000,
    notificationsEnabled: true,
    audioAlertEnabled: false,
    currentSummary: 'Screen observer is off.',
    lastSampleAtMs: null,
    lastAlertAtMs: null,
    alertsCount: 0,
    trust: 'unverified',
    updatedAtMs: null,
  })),
  getScreenObserverLogs: vi.fn(() => []),
  requestScreenNotificationPermission: vi.fn().mockResolvedValue('granted'),
  startScreenObserver: vi.fn().mockResolvedValue({ ok: true }),
  stopScreenObserver: vi.fn().mockReturnValue({
    enabled: false,
    status: 'stopped',
    permission: 'denied',
    sampleEveryMs: 5000,
    notificationsEnabled: true,
    audioAlertEnabled: false,
    currentSummary: 'Screen observer stopped.',
    lastSampleAtMs: null,
    lastAlertAtMs: null,
    alertsCount: 0,
    trust: 'temporary',
    updatedAtMs: Date.now(),
  }),
  updateScreenObserverState: vi.fn((patch) => ({ ...patch, updatedAtMs: Date.now() })),
}));

vi.mock('../../services/notificationService', () => ({
  sendNativeNotification: vi.fn(),
}));

vi.mock('../../agents/agentRegistry', () => ({
  listAgentProfiles: vi.fn(() => [
    { id: 'alphonso', name: 'Alphonso', title: 'Local Operator', role: 'execution' },
    { id: 'jose', name: 'Jose', title: 'Orchestrator', role: 'coordination' },
    { id: 'hector', name: 'Hector', title: 'Researcher', role: 'research' },
    { id: 'miya', name: 'Miya', title: 'Creative', role: 'creative' },
  ]),
}));

vi.mock('../../lib/chatUtils', () => ({
  needsHighRiskApproval: vi.fn(() => false),
}));

vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: {
    VERIFIED: 'verified',
    INFERRED: 'inferred',
    TEMPORARY: 'temporary',
    UNVERIFIED: 'unverified',
    FAILED: 'failed',
    PENDING: 'pending',
  },
  timestampMs: vi.fn(() => Date.now()),
}));

vi.mock('../../constants/appConstants', () => ({
  INITIAL_CONVERSATION_ID: 'default-session',
  VERIFICATION_LOG_CAP: 250,
  SNAPSHOT_HISTORY_CAP: 40,
  MEMORY_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  SCREEN_OBSERVER_INTERVAL_MS: 5000,
  COACH_PAUSE_MS: 60000,
  companionStateFromVoice: vi.fn((voiceStatus) => (voiceStatus?.state === 'listening' ? 'listening' : 'idle')),
  coachMessageFromVoice: vi.fn((voiceStatus) => voiceStatus?.message || 'Mic is off.'),
}));

import { useAppShellState } from '../../hooks/useAppShellState';
import { getStorage } from '../../lib/appStorage';
import { listMemoryItems, pushMemoryItem } from '../../services/memoryService';
import { listSnapshots, createSnapshot, restoreSnapshotById, backupMemoryLedger } from '../../services/recoveryService';
import { appendVerificationLog, getVerificationLogs } from '../../services/verificationService';
import { getScreenObserverState, getScreenObserverLogs, requestScreenNotificationPermission, startScreenObserver, stopScreenObserver, updateScreenObserverState } from '../../services/screenIntelligenceService';
import { listAgentProfiles } from '../../agents/agentRegistry';
import { needsHighRiskApproval } from '../../lib/chatUtils';

describe('useAppShellState', () => {
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
  };

  const mockVoice = {
    voiceStatus: { state: 'idle', message: 'Mic is off.' },
  };

  const mockToast = { show: vi.fn() };

  const defaultProps = {
    settings: mockSettings,
    setSettings: vi.fn(),
    operatorMode: false,
    setOperatorMode: vi.fn(),
    ollamaStatus: { state: 'connected' },
    desktopBridge: { state: 'connected', label: 'Connected', message: 'Alphonso' },
    lastCheckedAt: Date.now(),
    installedModels: ['llama3.1'],
    selectedModelMissing: false,
    runOllamaCheck: vi.fn(),
    copyTroubleshootingCommand: vi.fn(),
    copyState: vi.fn(),
    plugins: [],
    pluginAudit: {},
    pluginSandboxPolicy: {},
    diskPluginManifests: {},
    lastPluginToolRun: null,
    lastManifestValidation: null,
    handleTogglePlugin: vi.fn(),
    handleExecutePluginTool: vi.fn(),
    handleValidatePluginManifest: vi.fn(),
    handleDiscoverPlugins: vi.fn(),
    handleUpdatePluginSandboxPolicy: vi.fn(),
    workspaceFoundation: null,
    workspaceProof: null,
    ocrCapability: null,
    workspaceSymbolIndex: null,
    lastOcrAdapterRun: null,
    handleRunWorkspaceProof: vi.fn(),
    handleCheckOcrCapability: vi.fn(),
    handleBuildSymbolIndex: vi.fn(),
    handleRunOcrAdapter: vi.fn(),
    handleToggleWorkspaceFeature: vi.fn(),
    verificationLogs: [],
    durableAuditLogs: [],
    auditChainProof: null,
    setVerificationLogs: vi.fn(),
    setDurableAuditLogs: vi.fn(),
    verifyOllamaWithProof: vi.fn(),
    verifyProcesses: vi.fn(),
    verifyPaths: vi.fn(),
    verifyAuditChain: vi.fn(),
    verifyCommand: vi.fn(),
    handleRunReleasePreflight: vi.fn(),
    handleRuntimeRepair: vi.fn(),
    coachMode: false,
    coachAlwaysOnTop: false,
    coachMiniMode: false,
    coachSnapCorner: 'bottom-right',
    coachIntervention: null,
    coachPauseUntilMs: null,
    setCoachMode: vi.fn(),
    setCoachMiniMode: vi.fn(),
    setCoachAlwaysOnTop: vi.fn(),
    handleToggleCoachMode: vi.fn(),
    handleToggleCoachTop: vi.fn(),
    handleCoachInterventionAction: vi.fn(),
    minimizeToCoach: vi.fn(),
    voice: mockVoice,
    toast: mockToast,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getStorage.mockImplementation((key, fallback) => fallback);
    listMemoryItems.mockReturnValue([]);
    listSnapshots.mockReturnValue([]);
    getScreenObserverState.mockReturnValue({
      enabled: false,
      status: 'idle',
      permission: 'unknown',
      sampleEveryMs: 5000,
      notificationsEnabled: true,
      audioAlertEnabled: false,
      currentSummary: 'Screen observer is off.',
      lastSampleAtMs: null,
      lastAlertAtMs: null,
      alertsCount: 0,
      trust: 'unverified',
      updatedAtMs: null,
    });
    getScreenObserverLogs.mockReturnValue([]);
    listAgentProfiles.mockReturnValue([
      { id: 'alphonso', name: 'Alphonso', title: 'Local Operator', role: 'execution' },
      { id: 'jose', name: 'Jose', title: 'Orchestrator', role: 'coordination' },
      { id: 'hector', name: 'Hector', title: 'Researcher', role: 'research' },
      { id: 'miya', name: 'Miya', title: 'Creative', role: 'creative' },
    ]);
    needsHighRiskApproval.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Sidebar state transitions', () => {
    it('initializes isSidebarOpen to true', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.isSidebarOpen).toBe(true);
    });

    it('toggles sidebar open/close via setIsSidebarOpen', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.setIsSidebarOpen(false);
      });
      expect(result.current.isSidebarOpen).toBe(false);
      act(() => {
        result.current.setIsSidebarOpen(true);
      });
      expect(result.current.isSidebarOpen).toBe(true);
    });
  });

  describe('Right panel mode switching', () => {
    it('initializes activeTab to mission', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.activeTab).toBe('mission');
    });

    it('switches activeTab via switchTab', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.switchTab('chat');
      });
      expect(result.current.activeTab).toBe('chat');
      act(() => {
        result.current.switchTab('automation');
      });
      expect(result.current.activeTab).toBe('automation');
      act(() => {
        result.current.switchTab('settings');
      });
      expect(result.current.activeTab).toBe('settings');
    });

    it('normalizes legacy workflows tab to automation', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.switchTab('workflows');
      });
      expect(result.current.activeTab).toBe('automation');
    });
  });

  describe('Theme persistence', () => {
    it('accepts themed settings without error', () => {
      const propsWithTheme = { ...defaultProps, settings: { ...mockSettings, environmentTheme: 'minimal_runtime' } };
      const { result } = renderHook(() => useAppShellState(propsWithTheme));
      expect(result.current.activeTab).toBe('mission');
      expect(result.current.isSidebarOpen).toBe(true);
    });
  });

  describe('Conversations state management', () => {
    it('initializes conversations with default session', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0].id).toBe('default-session');
    });

    it('creates new chat via createNewChat', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.createNewChat();
      });
      expect(result.current.conversations).toHaveLength(2);
      expect(result.current.activeChatId).toMatch(/^chat-\d+-[a-z0-9]+$/);
      expect(result.current.activeTab).toBe('chat');
    });

    it('does not collide ids when two chats are created in the same millisecond', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      const realNow = Date.now;
      Date.now = () => 1700000000000;
      try {
        act(() => {
          result.current.createNewChat();
        });
        act(() => {
          result.current.createNewChat();
        });
      } finally {
        Date.now = realNow;
      }
      const ids = result.current.conversations.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.current.conversations).toHaveLength(3);
    });

    it('deletes chat and resets to default when last chat removed', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.createNewChat();
      });
      const chatId = result.current.conversations[0].id;
      act(() => {
        result.current.deleteChat(chatId, { stopPropagation: vi.fn() });
      });
      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0].id).toBe('default-session');
    });

    it('switches to next chat when active chat deleted', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.createNewChat();
      });
      const firstChatId = result.current.conversations[1].id;
      act(() => {
        result.current.createNewChat();
      });
      const secondChatId = result.current.conversations[0].id;
      act(() => {
        result.current.setActiveChatId(firstChatId);
      });
      act(() => {
        result.current.deleteChat(firstChatId, { stopPropagation: vi.fn() });
      });
      expect(result.current.activeChatId).toBe(secondChatId);
    });
  });

  describe('Coach window visibility', () => {
    it('does not manage coachMode internally (delegated to CoachContext)', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.coachMode).toBeUndefined();
      expect(result.current.setCoachMode).toBeUndefined();
    });

    it('accepts coach props without error', () => {
      const propsWithCoach = { ...defaultProps, coachMode: true };
      const { result } = renderHook(() => useAppShellState(propsWithCoach));
      expect(result.current.activeTab).toBe('mission');
    });
  });

  describe('Agent dock visibility and switching', () => {
    it('returns mergedAgentDockCompanions with all agents', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      const companions = result.current.mergedAgentDockCompanions;
      expect(companions).toHaveLength(4);
      expect(companions.map(c => c.agentId)).toEqual(['alphonso', 'jose', 'hector', 'miya']);
    });

    it('includes correct state for each agent', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      const alphonso = result.current.mergedAgentDockCompanions.find(c => c.agentId === 'alphonso');
      expect(alphonso).toBeDefined();
      expect(alphonso.state).toBe('idle');
    });
  });

  describe('Notification center state', () => {
    it('initializes updateCheckState with default values', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.updateCheckState).toEqual(expect.objectContaining({
        checking: false,
        configured: false,
        available: false,
        latestVersion: null,
        currentVersion: '',
        notes: null,
        pubDate: null,
        downloadUrl: null,
        checkedAtMs: null,
        trust: 'unverified',
        error: null,
        notificationSent: false,
      }));
    });
  });

  describe('Command palette state', () => {
    it('initializes showOnboarding based on localStorage', () => {
      getStorage.mockReturnValueOnce(false);
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.showOnboarding).toBe(true);
    });

    it('initializes showOnboarding as false when onboarding complete', () => {
      getStorage.mockImplementation((key, fallback) => (key === 'alphonso_onboarding_complete_v1' ? true : fallback));
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.showOnboarding).toBe(false);
    });
  });

  describe('Search modal state', () => {
    it('initializes showWorkflowPanel to false', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.showWorkflowPanel).toBe(false);
    });

    it('toggles showWorkflowPanel via setShowWorkflowPanel', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.setShowWorkflowPanel(true);
      });
      expect(result.current.showWorkflowPanel).toBe(true);
    });
  });

  describe('Loading states for async operations', () => {
    it('initializes isGeneratingResponse to false', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.isGeneratingResponse).toBe(false);
    });

    it('toggles isGeneratingResponse via setIsGeneratingResponse', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.setIsGeneratingResponse(true);
      });
      expect(result.current.isGeneratingResponse).toBe(true);
    });
  });

  describe('Error boundary integration', () => {
    it('initializes approvalPending to null', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.approvalPending).toBeNull();
    });

    it('sets approvalPending via requestApproval when approvalMode enabled', async () => {
      const propsWithApproval = {
        ...defaultProps,
        settings: { ...mockSettings, approvalMode: true },
      };
      needsHighRiskApproval.mockReturnValueOnce(true);
      const { result } = renderHook(() => useAppShellState(propsWithApproval));
      let approvalPromise;
      act(() => {
        approvalPromise = result.current.requestApproval({ actionLabel: 'Test action' });
      });
      expect(result.current.approvalPending).toEqual(expect.objectContaining({ actionLabel: 'Test action' }));
      act(() => {
        result.current.approvalResolveRef.current(true);
      });
      await approvalPromise;
      expect(result.current.approvalPending).toEqual(expect.objectContaining({ actionLabel: 'Test action' }));
    });
  });

  describe('Keyboard shortcut handlers', () => {
    it('returns switchTab function', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(typeof result.current.switchTab).toBe('function');
    });

    it('returns createNewChat function', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(typeof result.current.createNewChat).toBe('function');
    });

    it('returns deleteChat function', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(typeof result.current.deleteChat).toBe('function');
    });
  });

  describe('Snapshot management', () => {
    it('creates snapshot via handleCreateSnapshot when approved', async () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      createSnapshot.mockResolvedValueOnce({ id: 'snap-new', timestampMs: Date.now(), trust: 'verified', payload: {} });
      await act(async () => {
        await result.current.handleCreateSnapshot();
      });
      expect(createSnapshot).toHaveBeenCalled();
      expect(result.current.snapshots).toHaveLength(1);
    });

    it('does not create snapshot when approval denied', async () => {
      const propsWithApproval = {
        ...defaultProps,
        settings: { ...mockSettings, approvalMode: true },
      };
      needsHighRiskApproval.mockReturnValue(true);
      const { result } = renderHook(() => useAppShellState(propsWithApproval));
      let createPromise;
      act(() => {
        createPromise = result.current.handleCreateSnapshot();
      });
      act(() => {
        result.current.approvalResolveRef.current(false);
      });
      await createPromise;
      expect(createSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('Screen observer state management', () => {
    it('initializes screenObserverState from service', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.screenObserverState.status).toBe('idle');
    });

    it('requests permission via handleRequestScreenObserverPermission', async () => {
      requestScreenNotificationPermission.mockResolvedValueOnce('granted');
      const { result } = renderHook(() => useAppShellState(defaultProps));
      await act(async () => {
        await result.current.handleRequestScreenObserverPermission();
      });
      expect(requestScreenNotificationPermission).toHaveBeenCalled();
    });

    it('starts screen observer via handleStartScreenObserver', async () => {
      startScreenObserver.mockResolvedValueOnce({ ok: true });
      const { result } = renderHook(() => useAppShellState(defaultProps));
      await act(async () => {
        await result.current.handleStartScreenObserver();
      });
      expect(startScreenObserver).toHaveBeenCalled();
    });

    it('stops screen observer via handleStopScreenObserver', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.handleStopScreenObserver();
      });
      expect(stopScreenObserver).toHaveBeenCalled();
    });

    it('updates screen observer settings via handleUpdateScreenObserverSettings', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.handleUpdateScreenObserverSettings({ notificationsEnabled: false });
      });
      expect(updateScreenObserverState).toHaveBeenCalledWith({ notificationsEnabled: false });
    });
  });

  describe('Diagnostics export', () => {
    it('exports diagnostics via handleExportDiagnostics', () => {
      const { result } = renderHook(() => useAppShellState(defaultProps));
      act(() => {
        result.current.handleExportDiagnostics();
      });
      expect(appendVerificationLog).toHaveBeenCalledWith(expect.objectContaining({
        type: 'diagnostics_export',
        source: 'operator-dashboard',
        trust: 'verified',
      }));
    });
  });

  describe('State hydration from localStorage', () => {
    it('hydrates conversations from localStorage on init', () => {
      const savedConversations = [
        { id: 'chat-1', title: 'Saved Chat', timestamp: Date.now() - 1000 },
        { id: 'chat-2', title: 'Another Chat', timestamp: Date.now() },
      ];
      getStorage.mockImplementation((key) => {
        if (key === 'alphonso_conversations') return savedConversations;
        return null;
      });
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.conversations).toEqual(savedConversations);
    });

    it('hydrates nativeSelfDevProof from localStorage on init', () => {
      const savedProof = { stage: 'test', timestamp: Date.now() };
      getStorage.mockImplementation((key, fallback) => {
        if (key === 'alphonso_native_selfdev_proof') return savedProof;
        return fallback;
      });
      const { result } = renderHook(() => useAppShellState(defaultProps));
      expect(result.current.nativeSelfDevProof).toEqual(savedProof);
    });
  });
});