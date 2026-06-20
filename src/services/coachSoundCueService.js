import { invoke } from '@tauri-apps/api/core';

const SOUND_CUE_STORAGE_KEY = 'alphonso_coach_sound_cues_v1';

const DEFAULT_SETTINGS = {
  enabled: true,
  quiet: false,
  firm: true,
  hard: true,
  volume: 0.22
};

const CUE_PATTERNS = {
  quiet: [{ frequency: 523, durationMs: 90 }],
  firm: [
    { frequency: 660, durationMs: 90 },
    { frequency: 440, durationMs: 130, gapMs: 55 }
  ],
  hard: [
    { frequency: 220, durationMs: 150 },
    { frequency: 220, durationMs: 150, gapMs: 70 },
    { frequency: 330, durationMs: 220, gapMs: 70 }
  ]
};

export function getCoachSoundCueSettings() {
  try {
    const raw = localStorage.getItem(SOUND_CUE_STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateCoachSoundCueSettings(patch = {}) {
  const next = { ...getCoachSoundCueSettings(), ...patch };
  try {
    invoke('kv_set', { key: SOUND_CUE_STORAGE_KEY, value: JSON.stringify(next) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  try {
    localStorage.setItem(SOUND_CUE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort local preference only.
  }
  return next;
}

export function shouldPlayCoachSoundCue(level, settings = getCoachSoundCueSettings()) {
  const cleanLevel = String(level || 'quiet').toLowerCase();
  if (!settings.enabled) return false;
  if (cleanLevel === 'hard') return settings.hard !== false;
  if (cleanLevel === 'firm') return settings.firm !== false;
  return settings.quiet === true;
}

export function getCoachSoundCuePattern(level) {
  return CUE_PATTERNS[String(level || 'quiet').toLowerCase()] || CUE_PATTERNS.quiet;
}

export async function playCoachSoundCue(level, options = {}) {
  const settings = { ...getCoachSoundCueSettings(), ...options.settings };
  if (!shouldPlayCoachSoundCue(level, settings)) {
    return { ok: false, skipped: true, reason: 'disabled' };
  }

  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) {
    return { ok: false, skipped: true, reason: 'audio_context_unavailable' };
  }

  try {
    const context = options.audioContext || new AudioContextCtor();
    if (context.state === 'suspended' && typeof context.resume === 'function') {
      await context.resume();
    }
    const startAt = context.currentTime + 0.01;
    let cursor = startAt;
    const volume = Math.max(0, Math.min(1, Number(settings.volume ?? DEFAULT_SETTINGS.volume)));

    for (const cue of getCoachSoundCuePattern(level)) {
      cursor += (Number(cue.gapMs || 0) / 1000);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = level === 'hard' ? 'square' : 'sine';
      oscillator.frequency.setValueAtTime(Number(cue.frequency || 440), cursor);
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), cursor + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + (Number(cue.durationMs || 100) / 1000));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + (Number(cue.durationMs || 100) / 1000) + 0.02);
      cursor += Number(cue.durationMs || 100) / 1000;
    }

    return { ok: true, level: String(level || 'quiet'), cues: getCoachSoundCuePattern(level).length };
  } catch (error) {
    return { ok: false, skipped: true, reason: 'playback_failed', error: String(error) };
  }
}
