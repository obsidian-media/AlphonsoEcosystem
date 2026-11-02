import React, { useEffect, useState } from 'react';
import type { StudioData } from '../../services/phone/remoteData';
import type { PhoneLock } from '../MobileApp';
import { filterCalendarItems, itemsForMonth, itemsForWeek, type CalendarItem } from '../../services/contentFactory/calendarView';
import { PLATFORM_LABEL } from '../../components/calendar/calendarShared';
import { postStamp } from '../../services/phone/contentStamps';
import { confirmLockedCall } from '../lockedApproval';
import { PreviewPlayer } from './PreviewPlayer';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = (item: CalendarItem) => (item.hasTime ? new Date(item.atMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'No time');
const whenLabel = (ms: number) => `${dayLabel(ms)} ${new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
const inputValue = (ms: number) => { const d = new Date(ms); return `${dayKey(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Monday, local midnight, of the week holding `ms` (as the computer's Week view). */
function weekStartOf(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
}
const btn = 'rounded-lg px-3 py-1 text-xs disabled:opacity-50';

type Confirm = { kind: 'move'; atMs: number } | { kind: 'cancel' };

/** The Calendar on the phone (phase 2): a month as a list by day, or a week; filters; a post's sheet. */
export function CalendarScreen({ studio, lock, nowMs = Date.now() }: { studio: StudioData; lock: PhoneLock; nowMs?: number }) {
  const [items, setItems] = useState(studio.calendar());
  useEffect(() => studio.subscribe(() => setItems(studio.calendar())), [studio]);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [month, setMonth] = useState(() => { const d = new Date(nowMs); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [weekStart, setWeekStart] = useState(() => weekStartOf(nowMs));
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const brands = [...new Map(items.map((i) => [i.brandId || '', i.brandName])).entries()];
  const platforms = [...new Set(items.map((i) => i.platform))];
  const all = (keys: string[], hidden: Set<string>) => (hidden.size ? new Set(keys.filter((k) => !hidden.has(k))) : null);
  const filtered = filterCalendarItems(items, { brands: all(brands.map(([id]) => id), hiddenBrands), platforms: all(platforms, hiddenPlatforms) });
  const shown = (view === 'month' ? itemsForMonth(filtered, month.y, month.m) : itemsForWeek(filtered, weekStart)).sort((a, b) => a.atMs - b.atMs);
  const days = [...new Map(shown.map((i) => [dayKey(i.atMs), i.atMs])).entries()];
  const open = items.find((i) => i.id === openId) || null;
  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); apply(next); };

  const step = (by: number) => {
    if (view === 'month') { const d = new Date(month.y, month.m + by, 1); setMonth({ y: d.getFullYear(), m: d.getMonth() }); return; }
    const d = new Date(weekStart); setWeekStart(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * by).getTime());
  };
  const title = view === 'month'
    ? new Date(month.y, month.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `Week of ${dayLabel(weekStart)}`;

  const send = async (item: CalendarItem, name: 'content.movePost' | 'content.cancelPost', extra: Record<string, unknown>, done: string) => {
    if (!item.post || !item.projectId) return;
    if (name === 'content.cancelPost') {
      const refused = await confirmLockedCall(name, 'Cancel this post', lock);
      if (refused) { setMessage(refused); return; }
    }
    setBusy(true);
    const r = await studio.call(name, { projectId: item.projectId, postId: item.post.id, ...extra, base: postStamp(item.post) });
    setBusy(false);
    if (r.ok === false) { setMessage(r.reason); return; }
    setMessage(r.value?.stale ? r.value.message : done);
  };

  const askMove = (item: CalendarItem) => {
    if (!newTime) return;
    const atMs = new Date(newTime).getTime();
    if (!Number.isFinite(atMs)) { setMessage('Choose a day and time.'); return; }
    setNewTime(null);
    if (item.movesOnPlatform) setConfirm({ kind: 'move', atMs });
    else void send(item, 'content.movePost', { atMs }, `Moved to ${whenLabel(atMs)}.`);
  };

  return (
    <div className="space-y-3 pt-2 text-sm" data-testid="mobile-calendar">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous" onClick={() => step(-1)} className={`${btn} bg-(--surface-3)`}>‹</button>
        <span className="font-semibold">{title}</span>
        <button type="button" aria-label="Next" onClick={() => step(1)} className={`${btn} bg-(--surface-3)`}>›</button>
      </div>
      <div className="flex gap-2">
        {(['month', 'week'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`${btn} ${view === v ? 'bg-(--accent) text-white' : 'bg-(--surface-3)'}`}>{v === 'month' ? 'Month' : 'Week'}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {brands.map(([id, name]) => (
          <button key={`b-${id}`} type="button" aria-pressed={!hiddenBrands.has(id)} onClick={() => toggle(hiddenBrands, id, setHiddenBrands)}
            className={`${btn} ${hiddenBrands.has(id) ? 'bg-(--surface-2) text-(--text-3) line-through' : 'bg-(--surface-3)'}`}>{name}</button>
        ))}
        {platforms.map((p) => (
          <button key={`p-${p}`} type="button" aria-pressed={!hiddenPlatforms.has(p)} onClick={() => toggle(hiddenPlatforms, p, setHiddenPlatforms)}
            className={`${btn} ${hiddenPlatforms.has(p) ? 'bg-(--surface-2) text-(--text-3) line-through' : 'bg-(--surface-3)'}`}>{PLATFORM_LABEL[p]}</button>
        ))}
      </div>
      {message && <p role="status" className="rounded-lg bg-(--surface-3) px-3 py-2 text-xs">{message}</p>}
      {days.length === 0 && <p className="text-xs text-(--text-3)">Nothing scheduled.</p>}

      {days.map(([key, ms]) => (
        <section key={key} data-testid={`calendar-day-${key}`}>
          <h3 className="mb-1 text-xs font-semibold text-(--text-3)">{dayLabel(ms)}</h3>
          <ul className="space-y-1">
            {shown.filter((i) => dayKey(i.atMs) === key).map((i) => (
              <li key={i.id}>
                <button type="button" data-testid={`calendar-item-${i.id}`} data-needs-you={String(i.needsYou)} onClick={() => { setOpenId(i.id); setMessage(''); setNewTime(null); setConfirm(null); }}
                  className={`flex w-full items-center gap-2 rounded-xl p-2 text-left ${i.needsYou ? 'border border-(--warning) bg-(--surface-2)' : 'bg-(--surface-2)'}`}>
                  <span className="rounded px-1 text-[10px] font-semibold text-white" style={{ backgroundColor: i.brandColor }}>{i.initials}</span>
                  <span className="flex-1">
                    <span className="block text-xs">{timeLabel(i)} · {PLATFORM_LABEL[i.platform]} {i.piece}</span>
                    <span className="block truncate">{i.title}</span>
                  </span>
                  {i.needsYou && <span className="text-[10px] text-(--warning)">Needs you</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {open && (
        <section className="space-y-2 rounded-xl bg-(--surface-1) p-3" data-testid="calendar-sheet" aria-label="Post">
          <div className="flex justify-between"><span className="font-semibold">{open.title}</span><button type="button" onClick={() => setOpenId(null)} className="text-xs text-(--accent)">Close</button></div>
          <p className="text-xs text-(--text-2)">{open.brandName}{open.projectName ? ` · ${open.projectName}` : ''} · {PLATFORM_LABEL[open.platform]} {open.piece}</p>
          <p className="text-xs">{open.hasTime ? whenLabel(open.atMs) : 'No time'} · {open.statusLabel}</p>
          {open.reason && <p className="text-xs text-(--warning)">{open.reason}</p>}
          {open.link && <p className="break-all text-xs text-(--accent)">{open.link}</p>}
          {open.caption && <p className="whitespace-pre-wrap text-xs">{open.caption}</p>}
          {(() => {
            const media = open.post?.file ? studio.projects().find((p) => p.id === open.projectId)?.media?.find((m) => m.path === open.post?.file) : undefined;
            return media ? <PreviewPlayer studio={studio} mediaRef={media} /> : null;
          })()}
          {open.kind === 'post' && open.post && open.draggable ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button type="button" disabled={busy || studio.readOnly} onClick={() => setNewTime(inputValue(open.atMs))} className={`${btn} bg-(--surface-3)`}>Change time</button>
                <button type="button" disabled={busy || studio.readOnly} onClick={() => setConfirm({ kind: 'cancel' })} className={`${btn} bg-(--surface-3)`}>Cancel post</button>
              </div>
              {newTime !== null && (
                <div className="flex gap-2">
                  <input type="datetime-local" aria-label="New time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="flex-1 rounded-lg border border-(--border) px-2 py-1" />
                  <button type="button" disabled={!newTime} onClick={() => askMove(open)} className={`${btn} bg-(--accent) text-white`}>Move</button>
                </div>
              )}
              {confirm && (
                <div className="space-y-2 rounded-lg bg-(--surface-2) p-2" role="alertdialog">
                  <p className="text-xs">
                    {confirm.kind === 'move'
                      ? `Move to ${whenLabel(confirm.atMs)}? This changes the time on ${PLATFORM_LABEL[open.platform]}.`
                      : open.movesOnPlatform
                        ? `Cancel this post on ${PLATFORM_LABEL[open.platform]}?${open.platform === 'youtube' ? ' The video stays private on your channel.' : ''}`
                        : 'Cancel this post? It will not go out.'}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirm(null)} className={`${btn} bg-(--surface-3)`}>No</button>
                    <button type="button" disabled={busy} className={`${btn} bg-(--accent) text-white`} onClick={() => {
                      const c = confirm;
                      setConfirm(null);
                      void (c.kind === 'move'
                        ? send(open, 'content.movePost', { atMs: c.atMs }, `Moved to ${whenLabel(c.atMs)}.`)
                        : send(open, 'content.cancelPost', {}, 'Cancelled.'));
                    }}>{confirm.kind === 'move' ? 'Move it' : 'Cancel it'}</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-(--text-3)">Change this one on your computer.</p>
          )}
        </section>
      )}
    </div>
  );
}
