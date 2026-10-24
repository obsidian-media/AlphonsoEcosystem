// The content factory on Telegram (phase 4a): once a day, the posts that reached their
// 7-day numbers that day, with the lessons proposed from them (Keep / Drop); and each new
// idea (Start project / Dismiss). Uses the same sent log as Jose's messages; buttons carry
// short `c:` codes (Telegram allows 64 bytes), kept 7 days.
import { getBrand, listBrands, keepLesson, dropLesson, proposedLessons } from './contentBrandService';
import { listProjects } from './contentProjectService';
import { listIdeas, startProjectFromIdea, dismissIdea, getIdea } from './contentIdeas';
import { postBand } from './brandResults';
import type { PostPlatform } from './contentTypes';

export type ContentButtonAction = 'keep' | 'drop' | 'start' | 'dismiss';
export interface ContentButton { text: string; action: ContentButtonAction; ref: string }
export interface ContentNotification { key: string; text: string; buttons?: ContentButton[][] }
export interface ContentTelegramSettings { performanceSummaries: boolean; contentIdeas: boolean }

const BUTTONS_KEY = 'alphonso_content_telegram_buttons_v1';
const BUTTONS_KEPT = 200;
const BUTTON_TTL_MS = 7 * 24 * 3600e3;
const PLATFORM_NAME: Record<PostPlatform, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook' };
const BAND_WORD: Record<string, string> = { good: 'good', weak: 'weak', usual: 'usual' };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
}

/** Both on unless switched off in Settings → Approvals → Jose on Telegram. */
export function getContentTelegramSettings(): ContentTelegramSettings {
  const saved = readJson<Record<string, any>>('alphonso_settings', {})?.joseTelegram || {};
  return { performanceSummaries: saved.performanceSummaries !== false, contentIdeas: saved.contentIdeas !== false };
}

const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const n = (v: number) => Math.round(v).toLocaleString('en-US');

/** What to send now that hasn't been sent (pure apart from reading storage). */
export function collectContentNotifications(nowMs: number, sent: Set<string>, settings: ContentTelegramSettings): ContentNotification[] {
  const out: ContentNotification[] = [];
  const today = localDay(nowMs);
  if (settings.performanceSummaries && !sent.has(`perf:${today}`)) {
    const lines: string[] = [];
    const buttons: ContentButton[][] = [];
    let numbered = 0;
    for (const brand of listBrands()) {
      const lessons = proposedLessons(brand.id);
      for (const project of listProjects(brand.id)) {
        for (const post of project.posts || []) {
          const reading = post.metrics?.readings?.['7d'];
          if (!reading || localDay(reading.readAtMs) !== today) continue;
          const views = reading.values.views;
          const band = postBand(post, brand.id, '7d');
          const word = band && BAND_WORD[band] ? `, ${BAND_WORD[band]} for ${brand.name}` : '';
          lines.push(`${post.title} (${PLATFORM_NAME[post.platform]}): ${typeof views === 'number' ? `${n(views)} views` : 'views not available'}${word}.`);
          for (const lesson of lessons.filter((l) => l.postRef?.projectId === project.id && l.postRef?.postId === post.id)) {
            numbered += 1;
            lines.push(`${numbered}. ${lesson.kind === 'didnt' ? "Didn't work" : 'Worked'}: ${lesson.text}`);
            const ref = `${brand.id}|${lesson.id}`;
            buttons.push([{ text: `Keep ${numbered}`, action: 'keep', ref }, { text: `Drop ${numbered}`, action: 'drop', ref }]);
          }
        }
      }
    }
    if (lines.length) {
      out.push({ key: `perf:${today}`, text: [`Your posts after 7 days:`, ...lines].join('\n'), ...(buttons.length ? { buttons } : {}) });
    }
  }
  if (settings.contentIdeas) {
    for (const brand of listBrands()) {
      for (const idea of listIdeas(brand.id)) {
        const key = `idea:${idea.id}`;
        if (sent.has(key)) continue;
        const from = listProjects(brand.id).find((p) => p.id === idea.fromPost.projectId)?.posts?.find((p) => p.id === idea.fromPost.postId)?.title;
        out.push({
          key,
          text: `New idea for ${brand.name}: ${idea.text}${from ? ` (from "${from}")` : ''}`,
          buttons: [[{ text: 'Start project', action: 'start', ref: idea.id }, { text: 'Dismiss', action: 'dismiss', ref: idea.id }]],
        });
      }
    }
  }
  return out;
}

function randomCode(length: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => letters[b % letters.length]).join('');
}

/** A short code for a button's data, saved for 7 days. */
export function contentButtonToken(button: { action: ContentButtonAction; ref: string }, nowMs: number = Date.now()): string {
  const saved = readJson<Record<string, { action: ContentButtonAction; ref: string; atMs: number }>>(BUTTONS_KEY, {});
  const token = `c:${randomCode(8)}`;
  saved[token] = { action: button.action, ref: button.ref, atMs: nowMs };
  writeJson(BUTTONS_KEY, Object.fromEntries(Object.entries(saved).sort((a, b) => b[1].atMs - a[1].atMs).slice(0, BUTTONS_KEPT)));
  return token;
}

export function readContentButtonToken(data: string, nowMs: number = Date.now()): { action: ContentButtonAction; ref: string } | null {
  if (!/^c:[A-Za-z0-9]{8}$/.test(String(data || ''))) return null;
  const saved = readJson<Record<string, { action: ContentButtonAction; ref: string; atMs: number }>>(BUTTONS_KEY, {})[data];
  if (!saved || nowMs - saved.atMs > BUTTON_TTL_MS) return null;
  return { action: saved.action, ref: saved.ref };
}

/** A content button pressed on Telegram (the caller checks it came from the paired chat). */
export function handleContentButton(data: string, nowMs: number = Date.now()): string {
  const button = readContentButtonToken(data, nowMs);
  if (!button) return 'That button has expired.';
  if (button.action === 'keep' || button.action === 'drop') {
    const [brandId, lessonId] = button.ref.split('|');
    if (!getBrand(brandId)) return 'That button has expired.';
    const result = button.action === 'keep' ? keepLesson(brandId, lessonId) : dropLesson(brandId, lessonId);
    if (!result.ok) return 'Already done.';
    return button.action === 'keep' ? 'Kept.' : 'Dropped.';
  }
  const idea = getIdea(button.ref);
  if (!idea) return 'That button has expired.';
  if (idea.status !== 'new') return 'Already done.';
  if (button.action === 'dismiss') return dismissIdea(idea.id) ? 'Dismissed.' : 'Already done.';
  const project = startProjectFromIdea(idea.id);
  return project ? `Project started: ${project.name}.` : 'Already done.';
}
