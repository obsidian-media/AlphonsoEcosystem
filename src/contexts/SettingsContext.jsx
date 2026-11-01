import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getStorage, setStorage } from '../lib/appStorage';
import { getDefaultWorkspaceRoot } from '../services/workspaceRootService';

const SettingsContext = createContext(/** @type {any} */(null));

const DEFAULT_SETTINGS = {
  endpoint: 'http://localhost:11434',
  selectedModel: '',
  selectedProvider: 'ollama',
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
  updaterEndpoint: 'https://github.com/obsidian-media/AlphonsoEcosystem/releases/latest/download/latest.json',
  updaterPubkey: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDJENzgyMEY4MkZGMTE3OUMKUldTY0YvRXYrQ0I0TGRlVWt2cmZhcGVaUVRtQ0lZcDZkZUl5YmxqcEZvbjFYTG01ZnJvWVgwMUgK',
  updaterTarget: '',
  idleTimeoutMinutes: 15,
  autoLaunchServices: false,
  comfyuiDir: '',
  comfyuiPython: 'python',
  outputFolder: ''
};

/** The Coach window opens the app with ?coach=1 (coachModeService). */
export function isCoachWindow() {
  try {
    return new URLSearchParams(window.location.search).get('coach') === '1';
  } catch {
    return false;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettingsRaw] = useState(() => getStorage('alphonso_settings', DEFAULT_SETTINGS));
  const [operatorMode, setOperatorModeState] = useState(() => Boolean(getStorage('alphonso_operator_mode_v1', false)));

  // Persist settings to localStorage on every change, from the main window only. The Coach window
  // is a second window with its own copy, read when it opened; saving it wrote an older model (and
  // anything else) over what you chose in the main window (2.11.0 QA, owner 2026-11-01).
  useEffect(() => {
    if (isCoachWindow()) return;
    setStorage('alphonso_settings', settings);
  }, [settings]);

  // Follow settings another window saved (the browser tells every other window).
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'alphonso_settings' || !event.newValue) return;
      try {
        const saved = JSON.parse(event.newValue);
        if (saved && typeof saved === 'object') setSettingsRaw((current) => ({ ...current, ...saved }));
      } catch { /* not settings */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSettings = useCallback((valueOrUpdater) => {
    setSettingsRaw((current) => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(current) : valueOrUpdater;
      return next;
    });
  }, []);

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
