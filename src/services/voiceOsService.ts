import { invoke } from '@tauri-apps/api/core';
import { appendAgentActivity } from './agentActivityService.js';
import { getConfiguredOllamaEndpoint, getConfiguredOllamaModel } from '../lib/ollama';

const DEFAULT_WS_URL = 'ws://127.0.0.1:8766/ws';

export async function startVoiceServer() {
  // The Ollama address and model chosen in Settings. The address is given to
  // Voice OS only here, at start, never over its connection (2026-10-22).
  const result = await invoke('voice_start', { ollamaEndpoint: getConfiguredOllamaEndpoint(), ollamaModel: getConfiguredOllamaModel() });
  appendAgentActivity({ agent: 'alphonso', action: 'voice_server_start', detail: 'Voice OS started' });
  return result;
}

export async function stopVoiceServer() {
  // A deliberate stop: the watchdog must not start it again.
  _seenRunning = false;
  const result = await invoke('voice_stop');
  appendAgentActivity({ agent: 'alphonso', action: 'voice_server_stop', detail: 'Voice OS stopped' });
  return result;
}

/**
 * Returns the per-session token generated when Voice OS started. Must be
 * appended to the WebSocket URL as `?token=<value>`. Throws if Voice OS is
 * not running.
 */
export async function getVoiceToken(): Promise<string> {
  return invoke<string>('voice_get_token');
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
let _seenRunning = false;
const WATCHDOG_MAX_FAILURES = 5;

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('alphonso:toast', { detail: { type: 'error', message } }));
}

/**
 * One watchdog check. Restarts Voice OS only when it was running and has
 * stopped (QA 2026-10-22): the watchdog used to treat "not started" as
 * "crashed", so everyone who doesn't use voice got "Voice OS offline -
 * restarting..." five times after launch while it tried to start Python.
 */
export async function checkVoiceWatchdog(): Promise<void> {
  if (_watchdogFailures >= WATCHDOG_MAX_FAILURES) return; // backed off
  let status: unknown;
  try {
    status = await getVoiceServerStatus();
  } catch {
    status = 'unknown';
  }
  if (status === 'running') {
    _seenRunning = true;
    _watchdogFailures = 0;
    return;
  }
  if (!_seenRunning) return; // never started (or stopped on purpose): nothing to restart
  _watchdogFailures++;
  if (_watchdogFailures >= WATCHDOG_MAX_FAILURES) {
    toast('Voice OS stopped and could not be restarted after 5 attempts. Start it again from the Voice page.');
    return;
  }
  toast('Voice OS stopped unexpectedly. Restarting...');
  try { await startVoiceServer(); } catch { /* the next check reports it */ }
}

export async function startVoiceWatchdog() {
  stopVoiceWatchdog();
  _watchdogFailures = 0;
  _watchdogInterval = setInterval(() => { void checkVoiceWatchdog(); }, 30_000);
}

/** Test helper: forget what the watchdog has seen. */
export function resetVoiceWatchdogState(): void {
  _watchdogFailures = 0;
  _seenRunning = false;
}

export function stopVoiceWatchdog() {
  if (_watchdogInterval !== null) {
    clearInterval(_watchdogInterval);
    _watchdogInterval = null;
  }
}
