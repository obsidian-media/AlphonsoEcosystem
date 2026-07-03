import { TRUST_STATES, timestampMs } from './trustModel';

const STATE_KEY = 'alphonso_screen_observer_state_v1';
const LOG_KEY = 'alphonso_screen_observer_logs_v1';

export interface ScreenObserverState {
  enabled: boolean;
  status: string;
  permission: string;
  sampleEveryMs: number;
  notificationsEnabled: boolean;
  audioAlertEnabled: boolean;
  currentSummary: string;
  lastSampleAtMs: number | null;
  lastAlertAtMs: number | null;
  alertsCount: number;
  trust: string;
  updatedAtMs: number | null;
}

export interface ScreenEvent {
  id: string;
  timestampMs: number;
  status: string;
  summary: string;
  changeLevel: number;
  patternBucket: string;
  repeatedPattern: boolean;
  signaturePreview: string;
}

const DEFAULT_STATE: ScreenObserverState = {
  enabled: false,
  status: 'idle',
  permission: 'unknown',
  sampleEveryMs: 5000,
  notificationsEnabled: true,
  audioAlertEnabled: false,
  currentSummary: 'Screen observer is off.',
  lastSampleAtMs: null,
  lastAlertAtMs: null,
  alertsCount: 0,
  trust: TRUST_STATES.UNVERIFIED,
  updatedAtMs: null
};

let liveRun: { stop: (reason?: string) => void } | null = null;

function readJson(key: string, fallback: ScreenObserverState): ScreenObserverState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: ScreenObserverState): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function readLogs(): ScreenEvent[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs: ScreenEvent[]): void {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-500)));
}

function signatureFromImageData(imageData: ImageData): string {
  const { data, width, height } = imageData;
  const blocksX = 8;
  const blocksY = 6;
  const blockW = Math.max(1, Math.floor(width / blocksX));
  const blockH = Math.max(1, Math.floor(height / blocksY));
  const values: number[] = [];

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      let sum = 0;
      let count = 0;
      const startX = bx * blockW;
      const startY = by * blockH;
      for (let y = startY; y < Math.min(height, startY + blockH); y += 1) {
        for (let x = startX; x < Math.min(width, startX + blockW); x += 1) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          sum += (r + g + b) / 3;
          count += 1;
        }
      }
      const avg = count > 0 ? Math.round(sum / count) : 0;
      values.push(avg);
    }
  }

  return values.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function similarityScore(signatureA: string | null, signatureB: string): number {
  if (!signatureA || !signatureB || signatureA.length !== signatureB.length) return 0;
  let same = 0;
  for (let i = 0; i < signatureA.length; i += 2) {
    const a = parseInt(signatureA.slice(i, i + 2), 16);
    const b = parseInt(signatureB.slice(i, i + 2), 16);
    const distance = Math.abs(a - b);
    if (distance <= 12) same += 1;
  }
  return same / (signatureA.length / 2);
}

function beepAlert(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.stop(ctx.currentTime + 0.36);
  } catch {
    // ignore audio failures
  }
}

function notifyUser(title: string, body: string): void {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // ignore notification failures
  }
}

export function getScreenObserverState(): ScreenObserverState {
  const state = readJson(STATE_KEY, DEFAULT_STATE);
  if (!state.updatedAtMs) {
    const hydrated = { ...DEFAULT_STATE, ...state, updatedAtMs: timestampMs() };
    writeJson(STATE_KEY, hydrated);
    return hydrated;
  }
  return state;
}

export function getScreenObserverLogs(): ScreenEvent[] {
  return readLogs();
}

export function updateScreenObserverState(patch: Partial<ScreenObserverState>): ScreenObserverState {
  const current = getScreenObserverState();
  const next: ScreenObserverState = {
    ...current,
    ...patch,
    updatedAtMs: timestampMs()
  };
  writeJson(STATE_KEY, next);
  return next;
}

export async function requestScreenNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
}

export async function startScreenObserver({
  sampleEveryMs = 5000,
  notificationsEnabled = true,
  audioAlertEnabled = false,
  onUpdate
}: {
  sampleEveryMs?: number;
  notificationsEnabled?: boolean;
  audioAlertEnabled?: boolean;
  onUpdate?: (state: ScreenObserverState, event: ScreenEvent | null) => void;
} = {}): Promise<{ ok: boolean; reason?: string; error?: string }> {
  if (!navigator?.mediaDevices?.getDisplayMedia) {
    const state = updateScreenObserverState({
      status: 'unsupported',
      enabled: false,
      trust: TRUST_STATES.FAILED,
      currentSummary: 'Screen capture API is not supported in this runtime.',
      permission: 'unsupported'
    });
    onUpdate?.(state, null);
    return { ok: false, reason: 'unsupported' };
  }

  if (liveRun?.stop) {
    liveRun.stop('restart');
  }

  updateScreenObserverState({
    status: 'requesting_permission',
    enabled: false,
    trust: TRUST_STATES.PENDING,
    currentSummary: 'Requesting screen permission...'
  });

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 2, max: 4 },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (error) {
    const state = updateScreenObserverState({
      status: 'permission_denied',
      enabled: false,
      trust: TRUST_STATES.FAILED,
      currentSummary: `Screen permission denied: ${String(error)}`,
      permission: 'denied'
    });
    onUpdate?.(state, null);
    return { ok: false, reason: 'permission_denied', error: String(error) };
  }

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let lastSignature: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let patternCounts: Record<string, number> = {};

  const stop = (reason = 'stopped') => {
    if (stopped) return;
    stopped = true;
    if (timer) window.clearInterval(timer);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    liveRun = null;
    const state = updateScreenObserverState({
      enabled: false,
      status: reason === 'ended' ? 'stopped' : reason,
      trust: TRUST_STATES.TEMPORARY,
      currentSummary: reason === 'ended'
        ? 'Screen sharing ended by user.'
        : 'Screen observer stopped.'
    });
    onUpdate?.(state, null);
  };

  const track = stream.getVideoTracks()[0];
  if (track) {
    track.onended = () => stop('ended');
  }

  const runSample = () => {
    if (stopped || !ctx) return;
    const width = Math.max(160, Math.floor(video.videoWidth / 8));
    const height = Math.max(90, Math.floor(video.videoHeight / 8));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const signature = signatureFromImageData(imageData);
    const similarity = similarityScore(lastSignature, signature);
    const changeLevel = lastSignature ? 1 - similarity : 0;
    const timestamp = timestampMs();

    const bucket = signature.slice(0, 24);
    patternCounts = {
      ...patternCounts,
      [bucket]: (patternCounts[bucket] || 0) + 1
    };

    const repeatedPattern = patternCounts[bucket] >= 3;
    const highChange = changeLevel >= 0.42;
    const status = highChange ? 'high_change_detected' : repeatedPattern ? 'pattern_repeated' : 'stable_observation';
    const summary = highChange
      ? 'High visual change detected on screen.'
      : repeatedPattern
        ? 'Recurring visual pattern detected.'
        : 'Screen appears stable.';

    const event: ScreenEvent = {
      id: `screen-event-${timestamp}-${Math.random().toString(16).slice(2, 8)}`,
      timestampMs: timestamp,
      status,
      summary,
      changeLevel: Number(changeLevel.toFixed(3)),
      patternBucket: bucket,
      repeatedPattern,
      signaturePreview: signature.slice(0, 32)
    };

    const logs = readLogs();
    logs.push(event);
    writeLogs(logs);

    let alertsCount = getScreenObserverState().alertsCount || 0;
    let lastAlertAtMs = getScreenObserverState().lastAlertAtMs || null;
    if (highChange || repeatedPattern) {
      alertsCount += 1;
      lastAlertAtMs = timestamp;
      if (notificationsEnabled) {
        notifyUser('Alphonso Screen Alert', summary);
      }
      if (audioAlertEnabled) {
        beepAlert();
      }
    }

    const state = updateScreenObserverState({
      enabled: true,
      status: 'observing',
      permission: 'granted',
      sampleEveryMs,
      notificationsEnabled,
      audioAlertEnabled,
      trust: TRUST_STATES.INFERRED,
      currentSummary: summary,
      lastSampleAtMs: timestamp,
      lastAlertAtMs,
      alertsCount
    });
    onUpdate?.(state, event);
    lastSignature = signature;
  };

  const startState = updateScreenObserverState({
    enabled: true,
    status: 'observing',
    permission: 'granted',
    sampleEveryMs,
    notificationsEnabled,
    audioAlertEnabled,
    trust: TRUST_STATES.TEMPORARY,
    currentSummary: 'Screen observer is running. Visible capture is active.'
  });
  onUpdate?.(startState, null);

  runSample();
  timer = window.setInterval(runSample, Math.max(1200, sampleEveryMs));
  liveRun = { stop };
  return { ok: true };
}

export function stopScreenObserver(): ScreenObserverState {
  if (liveRun?.stop) {
    liveRun.stop('stopped');
    return updateScreenObserverState({
      enabled: false,
      status: 'stopped',
      trust: TRUST_STATES.TEMPORARY,
      currentSummary: 'Screen observer stopped by user.'
    });
  }
  return updateScreenObserverState({
    enabled: false,
    status: 'idle',
    trust: TRUST_STATES.UNVERIFIED,
    currentSummary: 'Screen observer is off.'
  });
}
