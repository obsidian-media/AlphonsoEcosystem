import { useCallback, useEffect, useRef } from 'react';
import { TRUST_STATES, timestampMs } from '../services/trustModel';
import { appendVerificationLog, verifyOllamaRuntimeProof } from '../services/verificationService';
import { pushMemoryItem } from '../services/memoryService';
import { checkOllama, chooseDefaultModel } from '../lib/ollama';

export function useOllamaHealth({
  settings,
  setSettings,
  desktopBridge,
  setOllamaStatus,
  setLastCheckedAt,
  setVerificationLogs,
  setMemoryItems,
  ollamaCheckRunRef
}) {
  const runOllamaCheck = useCallback(async () => {
    const runId = ollamaCheckRunRef.current + 1;
    ollamaCheckRunRef.current = runId;

    setOllamaStatus((current) => ({
      ...current,
      state: 'connecting',
      label: 'Connecting',
      message: 'Checking Ollama /api/tags...'
    }));

    let result = await checkOllama(settings.endpoint, settings.selectedModel);
    let trust = result.state === 'connected' ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED;

    if (
      desktopBridge.state === 'connected' &&
      ['not_running', 'disconnected', 'timeout', 'cors'].includes(result.state)
    ) {
      const proof = await verifyOllamaRuntimeProof(settings.endpoint);
      setVerificationLogs((current) => [...current, proof].slice(-250));

      const runtimeProof = proof?.payload || {};
      const proofModels = Array.isArray(runtimeProof.models)
        ? runtimeProof.models
            .filter((name) => typeof name === 'string' && name.trim())
            .map((name) => ({ name }))
        : [];

      if (runtimeProof.reachable) {
        const selectedFromProof = chooseDefaultModel(proofModels, settings.selectedModel);
        const mergedModels = proofModels.length > 0 ? proofModels : result.models;
        const hasModels = Array.isArray(mergedModels) && mergedModels.length > 0;
        result = {
          state: hasModels ? 'connected' : 'no_models',
          label: hasModels ? 'Connected (Desktop Bridge)' : 'No model available',
          message: hasModels
            ? 'Ollama is reachable from the desktop runtime bridge. Frontend CORS path is bypassed safely.'
            : 'Ollama is reachable from the desktop runtime bridge, but no local model was returned.',
          models: mergedModels,
          selectedModel: selectedFromProof || result.selectedModel,
          transport: 'desktop_bridge'
        };
        trust = TRUST_STATES.VERIFIED;
      } else if (runtimeProof.reason) {
        const normalizedReason = String(runtimeProof.reason).toLowerCase();
        if (normalizedReason.includes('timeout')) {
          result = {
            ...result,
            state: 'timeout',
            label: 'Request timeout',
            message: 'Ollama did not respond before timeout from desktop runtime proof.'
          };
        } else if (normalizedReason.includes('connection') || normalizedReason.includes('refused')) {
          result = {
            ...result,
            state: 'not_running',
            label: 'Ollama not running',
            message: 'Ollama is not reachable from frontend or desktop runtime proof.'
          };
        }
      }
    }

    if (ollamaCheckRunRef.current !== runId) return;

    setOllamaStatus({ ...result, trust });
    setLastCheckedAt(new Date());

    const log = appendVerificationLog({
      type: 'ollama_health_check',
      source: 'frontend-fetch',
      trust,
      payload: {
        endpoint: settings.endpoint,
        state: result.state,
        label: result.label,
        modelCount: result.models?.length || 0
      }
    });
    setVerificationLogs((current) => [...current, log].slice(-250));

    const memory = pushMemoryItem({
      category: 'runtime_memory',
      confidence: trust,
      source: 'ollama-health-check',
      verificationState: trust,
      expiresAt: timestampMs() + 5 * 60 * 1000,
      content: `Ollama check: ${result.label} (${result.state})`
    });
    setMemoryItems((current) => [...current, memory].slice(-500));

    if ((!settings.selectedModel || result.state === 'model_missing') && result.selectedModel) {
      setSettings((current) => ({
        ...current,
        selectedModel: result.selectedModel
      }));
    }
  }, [desktopBridge.state, settings.endpoint, settings.selectedModel, setOllamaStatus, setLastCheckedAt, setVerificationLogs, setMemoryItems, setSettings, ollamaCheckRunRef]);

  const initialCheckDoneRef = useRef(false);
  useEffect(() => {
    if (initialCheckDoneRef.current) return;
    initialCheckDoneRef.current = true;
    runOllamaCheck();
  }, [runOllamaCheck]);

  useEffect(() => {
    const POLL_INTERVAL = 30000;
    let timeoutId = null;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      await runOllamaCheck();
      if (!cancelled) {
        timeoutId = window.setTimeout(poll, POLL_INTERVAL);
      }
    };

    timeoutId = window.setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [runOllamaCheck]);

  return runOllamaCheck;
}
