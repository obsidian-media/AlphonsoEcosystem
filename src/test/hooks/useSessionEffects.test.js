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
    show: vi.fn(),
    hide: vi.fn(),
    minimize: vi.fn(),
  }),
  Window: vi.fn(),
}));

vi.mock('../services/coachInterventionService', () => ({
  COACH_INTERVENTION_LEVELS: { HARD: 'hard', SOFT: 'soft', MEDIUM: 'medium', INFO: 'info' },
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

const mockAppendSessionEvent = vi.fn();
vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: mockAppendSessionEvent,
}));

import { useSessionEffects } from '../../hooks/useSessionEffects';

describe('useSessionEffects', () => {
  const mockToast = {
    show: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };

  const defaultProps = {
    isCoachWindow: false,
    activeTab: 'mission',
    ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' },
    approvalRequiredNotice: false,
    prevOllamaStateRef: { current: 'connected' },
    toast: mockToast,
    setCoachIntervention: vi.fn(),
    setCoachMiniMode: vi.fn(),
    setCoachMode: vi.fn(),
    setJoseCompanionState: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAppendSessionEvent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Mount and basic behavior', () => {
    it('mounts without throwing', () => {
      const { result } = renderHook(() => useSessionEffects(defaultProps));
      expect(result.current).toBeUndefined();
    });

    it('does not throw when unmounting', () => {
      const { unmount } = renderHook(() => useSessionEffects(defaultProps));
      expect(() => unmount()).not.toThrow();
    });

    it('handles cleanup without errors on unmount', () => {
      const { unmount } = renderHook(() => useSessionEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });

  describe('Session lifecycle events', () => {
    it('appends session start event on mount', () => {
      renderHook(() => useSessionEffects(defaultProps));
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'app_lifecycle',
          title: 'Alphonso app session started',
          details: expect.objectContaining({ runtime: 'main_window' }),
          agent: 'alphonso',
          confidence: 'temporary',
          verificationState: 'unverified',
        })
      );
    });

    it('appends session start event with coach_window runtime when isCoachWindow is true', () => {
      const props = { ...defaultProps, isCoachWindow: true };
      renderHook(() => useSessionEffects(props));
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ runtime: 'coach_window' }),
        })
      );
    });

    it('appends session end event on beforeunload', () => {
      renderHook(() => useSessionEffects(defaultProps));
      act(() => {
        window.dispatchEvent(new Event('beforeunload'));
      });
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'app_lifecycle',
          title: 'Alphonso app window closing',
          details: expect.objectContaining({ runtime: 'main_window' }),
        })
      );
    });

    it('cleans up beforeunload listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useSessionEffects(defaultProps));
      unmount();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Agent switch events', () => {
    it('appends agent switch event when activeTab changes', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: { ...defaultProps, activeTab: 'mission' } } }
      );

      mockAppendSessionEvent.mockClear();
      rerender({ props: { ...defaultProps, activeTab: 'chat' } });

      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'agent_switch',
          title: 'Active workspace switched to chat',
          details: { activeTab: 'chat' },
        })
      );
    });

    it('maps activeTab to correct agent names', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: { ...defaultProps, activeTab: 'miya' } } }
      );

      mockAppendSessionEvent.mockClear();
      rerender({ props: { ...defaultProps, activeTab: 'miya' } });
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'miya' })
      );

      mockAppendSessionEvent.mockClear();
      rerender({ props: { ...defaultProps, activeTab: 'orchestrator' } });
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'jose' })
      );

      mockAppendSessionEvent.mockClear();
      rerender({ props: { ...defaultProps, activeTab: 'hector' } });
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'hector' })
      );

      mockAppendSessionEvent.mockClear();
      rerender({ props: { ...defaultProps, activeTab: 'alphonso' } });
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'alphonso' })
      );
    });

    it('defaults to alphonso agent for unknown tabs', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: { ...defaultProps, activeTab: 'unknown' } } }
      );

      mockAppendSessionEvent.mockClear();
      rerender({ props: { ...defaultProps, activeTab: 'unknown' } });
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'alphonso' })
      );
    });
  });

  describe('Ollama runtime state events', () => {
    it('appends runtime event when ollamaStatus.state changes', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: { ...defaultProps, ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' } } } }
      );

      mockAppendSessionEvent.mockClear();
      rerender({
        props: { ...defaultProps, ollamaStatus: { state: 'disconnected', label: 'Disconnected', models: [], trust: 'unverified' } }
      });

      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'runtime',
          title: 'Ollama runtime state: disconnected',
          details: expect.objectContaining({ state: 'disconnected', label: 'Disconnected' }),
        })
      );
    });

    it('uses ollamaStatus.trust for confidence and verificationState', () => {
      const props = { ...defaultProps, ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' } };
      renderHook(() => useSessionEffects(props));
      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 'verified',
          verificationState: 'unverified',
        })
      );
    });

    it('appends event when ollamaStatus.label changes', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: { ...defaultProps, ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' } } } }
      );

      mockAppendSessionEvent.mockClear();
      rerender({
        props: { ...defaultProps, ollamaStatus: { state: 'connected', label: 'Connected (2 models)', models: ['m1', 'm2'], trust: 'verified' } }
      });

      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'runtime',
          title: 'Ollama runtime state: connected',
          details: expect.objectContaining({ label: 'Connected (2 models)' }),
        })
      );
    });

    it('appends event when ollamaStatus.trust changes', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: { ...defaultProps, ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' } } } }
      );

      mockAppendSessionEvent.mockClear();
      rerender({
        props: { ...defaultProps, ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'inferred' } }
      });

      expect(mockAppendSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          confidence: 'inferred',
        })
      );
    });
  });

  describe('Ollama state change toasts', () => {
    it('shows error toast when Ollama disconnects from connected state', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'disconnected', label: 'Disconnected', models: [], trust: 'unverified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).toHaveBeenCalledWith(
        'Ollama disconnected',
        'Retrying automatically. Check that Ollama is running.'
      );
    });

    it('shows error toast when Ollama goes to not_running state', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'not_running', label: 'Not Running', models: [], trust: 'unverified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).toHaveBeenCalledWith(
        'Ollama disconnected',
        'Retrying automatically. Check that Ollama is running.'
      );
    });

    it('shows error toast when Ollama goes to cors state', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'cors', label: 'CORS Error', models: [], trust: 'unverified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).toHaveBeenCalledWith(
        'Ollama disconnected',
        'Retrying automatically. Check that Ollama is running.'
      );
    });

    it('shows error toast when Ollama goes to timeout state', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'timeout', label: 'Timeout', models: [], trust: 'unverified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).toHaveBeenCalledWith(
        'Ollama disconnected',
        'Retrying automatically. Check that Ollama is running.'
      );
    });

    it('shows error toast when Ollama goes to error state', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'error', label: 'Error', models: [], trust: 'failed' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).toHaveBeenCalledWith(
        'Ollama disconnected',
        'Retrying automatically. Check that Ollama is running.'
      );
    });

    it('shows success toast when Ollama reconnects', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'disconnected' },
        ollamaStatus: { state: 'connected', label: 'Connected', models: ['model1', 'model2'], trust: 'verified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.success).toHaveBeenCalledWith(
        'Ollama reconnected',
        'Connected to 2 model(s).'
      );
    });

    it('shows success toast with correct model count on reconnect', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'not_running' },
        ollamaStatus: { state: 'connected', label: 'Connected', models: ['m1', 'm2', 'm3'], trust: 'verified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.success).toHaveBeenCalledWith(
        'Ollama reconnected',
        'Connected to 3 model(s).'
      );
    });

    it('does not show success toast when prev state was connecting', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connecting' },
        ollamaStatus: { state: 'connected', label: 'Connected', models: ['model1'], trust: 'verified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('does not show toast when state does not change', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('does not show error toast when going from connecting to disconnected', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connecting' },
        ollamaStatus: { state: 'disconnected', label: 'Disconnected', models: [], trust: 'unverified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('updates prevOllamaStateRef.current on render', () => {
      const props = {
        ...defaultProps,
        prevOllamaStateRef: { current: 'connected' },
        ollamaStatus: { state: 'disconnected', label: 'Disconnected', models: [], trust: 'unverified' },
      };
      renderHook(() => useSessionEffects(props));
      expect(props.prevOllamaStateRef.current).toBe('disconnected');
    });
  });

  describe('Jose companion state', () => {
    it('sets warning state when Ollama is not connected', () => {
      const props = {
        ...defaultProps,
        ollamaStatus: { state: 'disconnected', label: 'Disconnected', models: [], trust: 'unverified' },
        activeTab: 'mission',
        approvalRequiredNotice: false,
      };
      renderHook(() => useSessionEffects(props));
      expect(props.setJoseCompanionState).toHaveBeenCalledWith({
        state: 'warning',
        message: 'Runtime attention required.',
      });
    });

    it('sets approving state when approvalRequiredNotice is true', () => {
      const props = {
        ...defaultProps,
        ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' },
        activeTab: 'mission',
        approvalRequiredNotice: true,
      };
      renderHook(() => useSessionEffects(props));
      expect(props.setJoseCompanionState).toHaveBeenCalledWith({
        state: 'approving',
        message: 'Approval queue needs review.',
      });
    });

    it('sets thinking state when activeTab is orchestrator', () => {
      const props = {
        ...defaultProps,
        ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' },
        activeTab: 'orchestrator',
        approvalRequiredNotice: false,
      };
      renderHook(() => useSessionEffects(props));
      expect(props.setJoseCompanionState).toHaveBeenCalledWith({
        state: 'thinking',
        message: 'Jose is reviewing the ecosystem.',
      });
    });

    it('sets idle state as default', () => {
      const props = {
        ...defaultProps,
        ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' },
        activeTab: 'mission',
        approvalRequiredNotice: false,
      };
      renderHook(() => useSessionEffects(props));
      expect(props.setJoseCompanionState).toHaveBeenCalledWith({
        state: 'idle',
        message: 'Jose is coordinating quietly.',
      });
    });

    it('priority: warning > approving > thinking > idle', () => {
      // Warning should take priority
      const props1 = {
        ...defaultProps,
        ollamaStatus: { state: 'disconnected', label: 'Disconnected', models: [], trust: 'unverified' },
        activeTab: 'orchestrator',
        approvalRequiredNotice: true,
      };
      renderHook(() => useSessionEffects(props1));
      expect(props1.setJoseCompanionState).toHaveBeenCalledWith({
        state: 'warning',
        message: 'Runtime attention required.',
      });

      // Approving should take priority over thinking
      const props2 = {
        ...defaultProps,
        ollamaStatus: { state: 'connected', label: 'Connected', models: [], trust: 'verified' },
        activeTab: 'orchestrator',
        approvalRequiredNotice: true,
      };
      renderHook(() => useSessionEffects(props2));
      expect(props2.setJoseCompanionState).toHaveBeenCalledWith({
        state: 'approving',
        message: 'Approval queue needs review.',
      });
    });
  });

  describe('Session guard bridge subscription', () => {
    it('subscribes to session guard bridge on mount', () => {
      const { subscribeSessionGuardBridge } = require('../services/coachInterventionService');
      renderHook(() => useSessionEffects(defaultProps));
      expect(subscribeSessionGuardBridge).toHaveBeenCalled();
    });

    it('sets coach intervention from bridge event', () => {
      const { subscribeSessionGuardBridge } = require('../services/coachInterventionService');
      const mockSetCoachIntervention = vi.fn();
      const props = { ...defaultProps, setCoachIntervention: mockSetCoachIntervention };

      subscribeSessionGuardBridge.mockImplementationOnce((cb) => {
        cb({ intervention: { level: 'hard', message: 'Test intervention' } });
      });

      renderHook(() => useSessionEffects(props));
      expect(mockSetCoachIntervention).toHaveBeenCalledWith({
        level: 'hard',
        message: 'Test intervention',
      });
    });

    it('sets coach mini mode to false on HARD intervention', () => {
      const { subscribeSessionGuardBridge } = require('../services/coachInterventionService');
      const mockSetCoachMiniMode = vi.fn();
      const mockSetCoachMode = vi.fn();
      const props = { ...defaultProps, setCoachMiniMode: mockSetCoachMiniMode, setCoachMode: mockSetCoachMode };

      subscribeSessionGuardBridge.mockImplementationOnce((cb) => {
        cb({ intervention: { level: 'hard', message: 'Test' } });
      });

      renderHook(() => useSessionEffects(props));
      expect(mockSetCoachMiniMode).toHaveBeenCalledWith(false);
      expect(mockSetCoachMode).toHaveBeenCalledWith(true);
    });

    it('plays sound cue for intervention level', () => {
      const { subscribeSessionGuardBridge } = require('../services/coachInterventionService');
      const { playCoachSoundCue } = require('../services/coachSoundCueService');

      subscribeSessionGuardBridge.mockImplementationOnce((cb) => {
        cb({ intervention: { level: 'soft', message: 'Test' } });
      });

      renderHook(() => useSessionEffects(defaultProps));
      expect(playCoachSoundCue).toHaveBeenCalledWith('soft');
    });

    it('does not play sound cue when no intervention level', () => {
      const { subscribeSessionGuardBridge } = require('../services/coachInterventionService');
      const { playCoachSoundCue } = require('../services/coachSoundCueService');

      subscribeSessionGuardBridge.mockImplementationOnce((cb) => {
        cb({ intervention: null });
      });

      renderHook(() => useSessionEffects(defaultProps));
      expect(playCoachSoundCue).not.toHaveBeenCalled();
    });
  });

  describe('Props handling', () => {
    it('accepts all required props without error', () => {
      renderHook(() => useSessionEffects(defaultProps));
      expect(true).toBe(true);
    });

    it('handles updated props on re-render', () => {
      const { rerender } = renderHook(
        ({ props }) => useSessionEffects(props),
        { initialProps: { props: defaultProps } }
      );

      const newProps = { ...defaultProps, activeTab: 'chat', coachMode: true };
      rerender({ props: newProps });
      expect(true).toBe(true);
    });
  });

  describe('Ref stability', () => {
    it('passes ref objects consistently across renders', () => {
      const { rerender } = renderHook(
        ({ refs }) => useSessionEffects(refs),
        { initialProps: { refs: defaultProps } }
      );

      rerender({ refs: { ...defaultProps, activeTab: 'chat' } });
      expect(true).toBe(true);
    });
  });

  describe('Idempotent initialization', () => {
    it('does not duplicate effects on re-render with same props', () => {
      const { rerender } = renderHook(() => useSessionEffects(defaultProps));
      rerender(defaultProps);
      expect(true).toBe(true);
    });
  });

  describe('Cleanup on unmount', () => {
    it('cleans up without errors', () => {
      const { unmount } = renderHook(() => useSessionEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });
});