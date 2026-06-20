import { useEffect } from 'react';
import {
  COACH_INTERVENTION_LEVELS,
  subscribeSessionGuardBridge
} from '../services/coachInterventionService';
import { playCoachSoundCue } from '../services/coachSoundCueService';
import { TRUST_STATES } from '../services/trustModel';
import { appendSessionEvent } from '../services/sessionIntelligenceService';

export function useSessionEffects({
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
}) {
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
}
