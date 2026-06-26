import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService.js';

const WS_URL = 'ws://127.0.0.1:8765/ws';

export async function startVoiceServer() {
  const result = await invoke('voice_start');
  appendAgentActivity({ agent: 'alphonso', action: 'voice_server_start', detail: 'Voice OS started' });
  return result;
}

export async function stopVoiceServer() {
  const result = await invoke('voice_stop');
  appendAgentActivity({ agent: 'alphonso', action: 'voice_server_stop', detail: 'Voice OS stopped' });
  return result;
}

export async function getVoiceServerStatus() {
  return invoke('voice_status');
}

export function getVoiceWebSocketUrl() {
  return WS_URL;
}

let _watchdogInterval = null;

export async function startVoiceWatchdog() {
  stopVoiceWatchdog();
  _watchdogInterval = setInterval(async () => {
    try {
      const status = await getVoiceServerStatus();
      if (status === 'stopped') {
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'error', message: 'Voice OS offline — restarting...' }
        }));
        await startVoiceServer();
      }
    } catch {
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { type: 'error', message: 'Voice OS offline — restarting...' }
      }));
      try { await startVoiceServer(); } catch { /* non-blocking */ }
    }
  }, 30_000);
}

export function stopVoiceWatchdog() {
  if (_watchdogInterval !== null) {
    clearInterval(_watchdogInterval);
    _watchdogInterval = null;
  }
}
