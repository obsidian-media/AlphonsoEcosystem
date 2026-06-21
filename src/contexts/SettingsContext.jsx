import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getStorage, setStorage } from '../lib/appStorage';
import { getDefaultWorkspaceRoot } from '../services/workspaceRootService';

const SettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
  endpoint: 'http://localhost:11434',
  selectedModel: '',
  workspaceRoot: getDefaultWorkspaceRoot(),
  ocrEnginePath: '',
  miyaCompanionPinned: true,
  joseCompanionPinned: true,
  hectorCompanionPinned: true,
  focusMode: 'mission_control',
  environmentTheme: 'minimal_runtime',
  colorScheme: 'dark',
  desktopMode: true,
  localOnlyMode: true,
  zeroCostMode: true,
  approvalMode: true,
  safeMode: true,
  privacyShieldActive: false,
  autoScroll: true,
  coachAgent: 'alphonso',
  autoUpdateEnabled: true,
  updaterEndpoint: 'https://github.com/Thatisshayan/AlphonsoEcosystem/releases/latest/download/latest.json',
  updaterPubkey: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDJENzgyMEY4MkZGMTE3OUMKUldTY0YvRXYrQ0I0TGRlVWt2cmZhcGVaUVRtQ0lZcDZkZUl5YmxqcEZvbjFYTG01ZnJvWVgwMUgK',
  updaterTarget: '',
  idleTimeoutMinutes: 15,
  autoLaunchServices: false,
  comfyuiDir: '',
  comfyuiPython: 'python',
  outputFolder: ''
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => getStorage('alphonso_settings', DEFAULT_SETTINGS));
  const [operatorMode, setOperatorModeState] = useState(() => Boolean(getStorage('alphonso_operator_mode_v1', false)));

  const setOperatorMode = useCallback((value) => {
    setOperatorModeState((current) => {
      const next = typeof value === 'function' ? value(current) : Boolean(value);
      setStorage('alphonso_operator_mode_v1', next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, setSettings, operatorMode, setOperatorMode }), [settings, setSettings, operatorMode, setOperatorMode]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
