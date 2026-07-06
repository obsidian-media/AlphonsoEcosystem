import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService.js';

const DEFAULT_WS_URL = 'ws://127.0.0.1:8765/ws';

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

export function getVoiceWebSocketUrl(): string {
  try {
    const saved = localStorage.getItem('alphonso_voice_ws_url');
    if (saved && saved.startsWith('ws://')) return saved;
  } catch { /* ignore */ }
  return DEFAULT_WS_URL;
}

let _watchdogInterval: ReturnType<typeof setInterval> | null = null;
let _watchdogFailures = 0;
const WATCHDOG_MAX_FAILURES = 5;

export async function startVoiceWatchdog() {
  stopVoiceWatchdog();
  _watchdogFailures = 0;
  _watchdogInterval = setInterval(async () => {
    if (_watchdogFailures >= WATCHDOG_MAX_FAILURES) return; // backed off — stop spamming
    try {
      const status = await getVoiceServerStatus();
      if (status === 'stopped') {
        _watchdogFailures++;
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'error', message: _watchdogFailures >= WATCHDOG_MAX_FAILURES
            ? 'Voice OS offline — giving up after 5 attempts. Restart manually in Runtimes.'
            : 'Voice OS offline — restarting...' }
        }));
        if (_watchdogFailures < WATCHDOG_MAX_FAILURES) {
          try { await startVoiceServer(); _watchdogFailures = 0; } catch { /* non-blocking */ }
        }
      } else {
        _watchdogFailures = 0; // reset on healthy status
      }
    } catch {
      _watchdogFailures++;
      if (_watchdogFailures <= WATCHDOG_MAX_FAILURES) {
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'error', message: 'Voice OS offline — restarting...' }
        }));
        try { await startVoiceServer(); _watchdogFailures = 0; } catch { /* non-blocking */ }
      }
    }
  }, 30_000);
}

export function stopVoiceWatchdog() {
  if (_watchdogInterval !== null) {
    clearInterval(_watchdogInterval);
    _watchdogInterval = null;
  }
}
