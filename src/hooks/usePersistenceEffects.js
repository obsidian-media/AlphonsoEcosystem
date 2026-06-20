import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { COACH_LAYOUT_KEY } from '../constants/appConstants';
import { setStorage } from '../lib/appStorage';

export function usePersistenceEffects({
  settings,
  conversations,
  nativeSelfDevProof,
  coachMiniMode,
  coachSnapCorner
}) {
  // Persistence: settings
  useEffect(() => {
    setStorage('alphonso_settings', settings);
    invoke('save_settings', { settingsJson: JSON.stringify(settings) }).catch(() => {});
  }, [settings]);

  // Persistence: conversations
  useEffect(() => {
    setStorage('alphonso_conversations', conversations);
    invoke('kv_set', { key: 'alphonso_conversations', value: JSON.stringify(conversations) }).catch(() => {});
  }, [conversations]);

  // Persistence: native selfdev proof
  useEffect(() => setStorage('alphonso_native_selfdev_proof', nativeSelfDevProof), [nativeSelfDevProof]);

  // Persistence: coach layout
  useEffect(() => setStorage(COACH_LAYOUT_KEY, { mini: coachMiniMode, corner: coachSnapCorner }), [coachMiniMode, coachSnapCorner]);
}
