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
