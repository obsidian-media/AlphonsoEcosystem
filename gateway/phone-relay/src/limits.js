// How much one device may send through the relay. Starting numbers (phone app plan,
// Task 3); change them here, nowhere else.
// A 4 MB message (PHONE_MAX_FRAME_BYTES in the app) becomes about 5.6 MB of sealed
// base64 text, so the relay allows 6 MB of text per frame.
export const LIMITS = Object.freeze({
  maxFrameChars: 6 * 1024 * 1024,
  framesPerSecond: 60,
  bytesPerDay: 200 * 1024 * 1024,
});

const DAY_MS = 24 * 3600 * 1000;

/** check(deviceId, chars, nowMs) → null when allowed, else 'too_large' | 'too_fast' | 'daily_limit'. */
export function createLimiter(limits = LIMITS) {
  const seconds = new Map(); // deviceId → { startMs, count }
  const days = new Map(); // deviceId → { startMs, chars }
  return {
    // Told to each device when it connects, so a device can keep under them (phone app phase 2).
    limits: { bytesPerDay: limits.bytesPerDay, maxFrameChars: limits.maxFrameChars },
    check(deviceId, chars, nowMs) {
      if (chars > limits.maxFrameChars) return 'too_large';
      const sec = seconds.get(deviceId);
      if (!sec || nowMs - sec.startMs >= 1000) seconds.set(deviceId, { startMs: nowMs, count: 1 });
      else if (sec.count >= limits.framesPerSecond) return 'too_fast';
      else sec.count += 1;
      const day = days.get(deviceId);
      if (!day || nowMs - day.startMs >= DAY_MS) {
        if (chars > limits.bytesPerDay) return 'daily_limit';
        days.set(deviceId, { startMs: nowMs, chars });
      } else if (day.chars + chars > limits.bytesPerDay) {
        return 'daily_limit';
      } else {
        day.chars += chars;
      }
      return null;
    },
    forget(deviceId) { seconds.delete(deviceId); days.delete(deviceId); },
  };
}
