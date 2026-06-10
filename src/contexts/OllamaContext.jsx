import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useOllamaHealth } from '../hooks/useOllamaHealth';
import { TRUST_STATES } from '../services/trustModel';
import { OLLAMA_TROUBLESHOOTING_COMMAND } from '../lib/ollama';
import { useSettings } from './SettingsContext';
import { COPY_RESET_MS } from '../constants/appConstants';

const OllamaContext = createContext(null);

export function OllamaProvider({ children, setVerificationLogs, setMemoryItems }) {
  const { settings, setSettings } = useSettings();
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
  const ollamaCheckRunRef = useRef(0);

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

  const copyTroubleshootingCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(OLLAMA_TROUBLESHOOTING_COMMAND);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), COPY_RESET_MS);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), COPY_RESET_MS);
    }
  }, []);

  const value = useMemo(() => ({
    ollamaStatus,
    desktopBridge,
    lastCheckedAt,
    installedModels,
    selectedModelMissing,
    runOllamaCheck,
    copyTroubleshootingCommand,
    copyState,
    ollamaCheckRunRef
  }), [ollamaStatus, desktopBridge, lastCheckedAt, installedModels, selectedModelMissing, runOllamaCheck, copyTroubleshootingCommand, copyState]);

  return (
    <OllamaContext.Provider value={value}>
      {children}
    </OllamaContext.Provider>
  );
}

export function useOllama() {
  const ctx = useContext(OllamaContext);
  if (!ctx) throw new Error('useOllama must be used within OllamaProvider');
  return ctx;
}
