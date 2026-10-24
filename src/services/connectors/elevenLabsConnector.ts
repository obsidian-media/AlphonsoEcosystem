// ElevenLabs (content factory phase 4b): the user's own voices (including ones they cloned
// in ElevenLabs) and models, read through the backend with the saved key. Speaking and sound
// effects run inside an approved content step (contentMediaExecutor), never from here.
import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';

export const ELEVENLABS_NOT_SET_UP = 'Add your ElevenLabs key in Settings → Connectors → ElevenLabs.';

export interface ElevenLabsVoice { id: string; name: string; cloned: boolean }
export interface ElevenLabsModel { id: string; name: string }

export function elevenLabsKey(): string {
  return String(getConnectorCredential('elevenlabs', 'ELEVENLABS_API_KEY') || '').trim();
}

export function isElevenLabsConfigured(): boolean {
  return elevenLabsKey().length > 0;
}

export async function listElevenLabsVoices(): Promise<{ ok: boolean; voices?: ElevenLabsVoice[]; reason?: string }> {
  if (!isElevenLabsConfigured()) return { ok: false, reason: ELEVENLABS_NOT_SET_UP };
  try {
    return (await invoke('elevenlabs_voices', { keyOverride: elevenLabsKey() })) as { ok: boolean; voices?: ElevenLabsVoice[]; reason?: string };
  } catch {
    return { ok: false, reason: 'ElevenLabs could not be reached.' };
  }
}

export async function listElevenLabsModels(): Promise<{ ok: boolean; models?: ElevenLabsModel[]; reason?: string }> {
  if (!isElevenLabsConfigured()) return { ok: false, reason: ELEVENLABS_NOT_SET_UP };
  try {
    return (await invoke('elevenlabs_models', { keyOverride: elevenLabsKey() })) as { ok: boolean; models?: ElevenLabsModel[]; reason?: string };
  } catch {
    return { ok: false, reason: 'ElevenLabs could not be reached.' };
  }
}
