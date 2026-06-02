import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getCoachSoundCuePattern,
  getCoachSoundCueSettings,
  playCoachSoundCue,
  shouldPlayCoachSoundCue,
  updateCoachSoundCueSettings
} from '../services/coachSoundCueService';

describe('coachSoundCueService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
  });

  it('plays firm and hard cues by default but keeps quiet nudges silent', () => {
    expect(shouldPlayCoachSoundCue('quiet')).toBe(false);
    expect(shouldPlayCoachSoundCue('firm')).toBe(true);
    expect(shouldPlayCoachSoundCue('hard')).toBe(true);
    expect(getCoachSoundCuePattern('hard').length).toBeGreaterThan(getCoachSoundCuePattern('quiet').length);
  });

  it('persists local sound cue preferences', () => {
    updateCoachSoundCueSettings({ enabled: false, volume: 0.1 });

    expect(getCoachSoundCueSettings()).toMatchObject({ enabled: false, volume: 0.1 });
    expect(shouldPlayCoachSoundCue('hard')).toBe(false);
  });

  it('returns a safe skipped result when browser audio is unavailable', async () => {
    await expect(playCoachSoundCue('hard')).resolves.toMatchObject({
      ok: false,
      skipped: true,
      reason: 'audio_context_unavailable'
    });
  });

  it('schedules local oscillator cues when audio is available', async () => {
    const oscillator = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { setValueAtTime: vi.fn() } };
    const gain = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      }
    };
    class FakeAudioContext {
      constructor() {
        this.currentTime = 1;
        this.state = 'running';
        this.destination = {};
      }
      createOscillator() { return oscillator; }
      createGain() { return gain; }
    }
    globalThis.AudioContext = FakeAudioContext;

    const result = await playCoachSoundCue('firm');

    expect(result).toMatchObject({ ok: true, level: 'firm', cues: 2 });
    expect(oscillator.start).toHaveBeenCalled();
    expect(gain.connect).toHaveBeenCalled();
  });
});
