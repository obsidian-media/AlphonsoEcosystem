import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultWorkspaceRoot } from '../services/workspaceRootService';
import { INITIAL_CONVERSATION_ID } from '../constants/appConstants';

const onIdle = typeof requestIdleCallback === 'function'
  ? requestIdleCallback
  : (cb) => setTimeout(cb, 50);

function cancelIdle(id) {
  if (typeof requestIdleCallback === 'function') cancelIdleCallback(id);
  else clearTimeout(id);
}

export function useBootEffects({
  settings,
  setSettings,
  setConversations,
  setActiveChatId,
  setDesktopBridge,
  setIsOnline
}) {
  const settingsHydratedRef = useRef(false);
  const conversationsHydratedRef = useRef(false);

  // Phase 0 (immediate): Boot ready RAF check
  useEffect(() => {
    let cancelled = false;
    let rafTwo = 0;
    const rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        if (cancelled) return;
        if (document.querySelector('[data-alphonso-shell-ready="true"]')) {
          window.__ALPHONSO_BOOT_READY__?.();
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafOne);
      if (rafTwo) window.cancelAnimationFrame(rafTwo);
    };
  }, []);

  // Phase 0 (immediate): Hydrate settings from SQLite
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

  // Phase 0 (immediate): Hydrate conversations from SQLite
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

  // Phase 1 (idle): Workspace root bootstrap
  useEffect(() => {
    let idleId;
    function run() {
      if (!settings.workspaceRoot) {
        setSettings((current) => (
          current.workspaceRoot
            ? current
            : { ...current, workspaceRoot: getDefaultWorkspaceRoot() }
        ));
      }
    }
    idleId = onIdle(run);
    return () => { if (idleId) cancelIdle(idleId); };
  }, [settings.workspaceRoot, setSettings]);

  // Phase 1 (idle): Zero cost mode default
  useEffect(() => {
    let idleId;
    function run() {
      if (typeof settings.zeroCostMode !== 'boolean') {
        setSettings((current) => ({ ...current, zeroCostMode: true }));
      }
    }
    idleId = onIdle(run);
    return () => { if (idleId) cancelIdle(idleId); };
  }, [settings.zeroCostMode, setSettings]);

  // Phase 1 (idle): Neon studio theme fallback
  useEffect(() => {
    let idleId;
    function run() {
      if (settings.environmentTheme === 'neon_studio') {
        setSettings((current) => ({
          ...current,
          environmentTheme: 'minimal_runtime'
        }));
      }
    }
    idleId = onIdle(run);
    return () => { if (idleId) cancelIdle(idleId); };
  }, [settings.environmentTheme, setSettings]);

  // Phase 1 (idle): Online/offline listener
  useEffect(() => {
    let idleId;
    function run() {
      window.addEventListener('online', () => setIsOnline(true));
      window.addEventListener('offline', () => setIsOnline(false));
    }
    idleId = onIdle(run);
    return () => { if (idleId) cancelIdle(idleId); };
  }, [setIsOnline]);

  // Phase 1 (idle): Desktop bridge inspection
  useEffect(() => {
    let cancelled = false;
    let idleId;

    async function inspectDesktopBridge() {
      try {
        const { getName, getVersion } = await import('@tauri-apps/api/app');
        const [name, version] = await Promise.all([getName(), getVersion()]);
        if (!cancelled) {
          setDesktopBridge({
            state: 'connected',
            label: 'Connected',
            message: `${name || 'Alphonso'} ${version || ''}`.trim()
          });
        }
      } catch {
        if (!cancelled) {
          setDesktopBridge({
            state: 'disconnected',
            label: 'Browser preview',
            message: 'Tauri app APIs are not available in this runtime.'
          });
        }
      }
    }

    idleId = onIdle(inspectDesktopBridge);
    return () => {
      cancelled = true;
      if (idleId) cancelIdle(idleId);
    };
  }, [setDesktopBridge]);
}
