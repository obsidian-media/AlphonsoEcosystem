import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '../ui';
import { listBrands } from '../../services/contentFactory/contentBrandService';
import {
  filterCalendarItems, itemsForMonth, itemsForWeek, listCalendarItems, moveCalendarItem, type CalendarItem,
} from '../../services/contentFactory/calendarItems';
import { cancelProjectPost, moveToDay, moveToSlot, type MoveResult } from '../../services/contentFactory/contentPostMoves';
import { MonthGrid } from './MonthGrid';
import { WeekGrid } from './WeekGrid';
import { CalendarSidePanel } from './CalendarSidePanel';
import { addDays, PLATFORM_COLOR, PLATFORM_LABEL, startOfWeek, whenLabel } from './calendarShared';

type Confirm = { kind: 'move'; item: CalendarItem; atMs: number } | { kind: 'cancel'; item: CalendarItem };
const PLATFORMS = ['youtube', 'instagram', 'facebook', 'other'] as const;

/**
 * The Calendar page (content factory phase 3b): every brand's posts, Content Studio's drafts
 * and Marcus's sends. Month (opens here) or Week, a side panel, brand chips and a platform
 * filter, drag to move; a post already on YouTube or Facebook asks before it changes there.
 */
export function CalendarPage({ initialDateMs, onOpenProject, expiries }: {
  initialDateMs?: number;
  onOpenProject?(projectId: string): void;
  expiries?: { youtube?: number | null; meta?: number | null };
}) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => initialDateMs ?? Date.now());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [message, setMessage] = useState<{ text: string; manageUrl?: string } | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);

  const brands = useMemo(() => listBrands(), [tick]);
  const all = useMemo(() => listCalendarItems(Date.now(), { expiries }), [tick, expiries]);
  const items = useMemo(() => {
    const brandIds = new Set([...brands.map((b) => b.id), ''].filter((id) => !hidden.has(id)));
    return filterCalendarItems(all, { brands: brandIds, platforms: platform === 'all' ? null : new Set([platform]) });
  }, [all, brands, hidden, platform]);
  const selected = all.find((i) => i.id === selectedId) || null;

  const date = new Date(cursor);
  const weekStart = startOfWeek(cursor);
  const shown = view === 'month' ? itemsForMonth(items, date.getFullYear(), date.getMonth()) : itemsForWeek(items, weekStart);

  const finish = (result: MoveResult) => {
    setMessage(result.ok ? null : { text: result.reason || 'That could not be changed.', ...(result.manageUrl ? { manageUrl: result.manageUrl } : {}) });
    refresh();
  };
  const requestMove = (item: CalendarItem, atMs: number) => {
    setSelectedId(item.id);
    if (item.movesOnPlatform) setConfirm({ kind: 'move', item, atMs });
    else void moveCalendarItem(item, atMs).then(finish);
  };
  const dragged = () => all.find((i) => i.id === dragId) || null;
  const dropOnDay = (dayStartMs: number) => {
    const item = dragged();
    setDragId(null);
    if (item?.draggable) requestMove(item, item.hasTime ? moveToDay(item.atMs, dayStartMs) : dayStartMs);
  };
  const dropOnSlot = (dayStartMs: number, hour: number | null) => {
    const item = dragged();
    setDragId(null);
    if (!item?.draggable) return;
    requestMove(item, hour === null ? dayStartMs : moveToSlot(dayStartMs, hour, new Date(item.atMs).getMinutes()));
  };
  const go = (step: number) => setCursor((c) => {
    if (view === 'week') return addDays(c, 7 * step);
    const d = new Date(c);
    return new Date(d.getFullYear(), d.getMonth() + step, 1).getTime();
  });
  const confirmNow = () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'move') void moveCalendarItem(c.item, c.atMs).then(finish);
    else if (c.item.projectId && c.item.postId) void cancelProjectPost(c.item.projectId, c.item.postId).then(finish);
  };

  const pill = 'rounded-full border border-(--border) px-2.5 py-0.5 text-[11px]';
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-serif text-lg font-bold text-(--text-1)">
          {view === 'month' ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : `Week of ${new Date(weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => go(-1)} aria-label="Earlier">‹</Button>
        <Button size="sm" variant="ghost" onClick={() => setCursor(Date.now())}>Today</Button>
        <Button size="sm" variant="ghost" onClick={() => go(1)} aria-label="Later">›</Button>
        <Button size="sm" variant={view === 'month' ? 'secondary' : 'ghost'} onClick={() => setView('month')}>Month</Button>
        <Button size="sm" variant={view === 'week' ? 'secondary' : 'ghost'} onClick={() => setView('week')}>Week</Button>
        <label className="text-[11px] text-(--text-3)">
          Platform{' '}
          <select aria-label="Platform" className="rounded-lg bg-(--surface-2) px-2 py-1 text-(--text-1)" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Brands">
        {[...brands.map((b) => ({ id: b.id, name: b.name, platforms: (b.platforms || []).join(', ') })), { id: '', name: 'Content Studio and other sends', platforms: '' }].map((b) => (
          <button
            key={b.id || 'other'}
            type="button"
            aria-pressed={!hidden.has(b.id)}
            onClick={() => setHidden((h) => { const next = new Set(h); if (next.has(b.id)) next.delete(b.id); else next.add(b.id); return next; })}
            className={`${pill} ${hidden.has(b.id) ? 'opacity-40 line-through' : ''}`}
          >
            {b.name}{b.platforms ? ` · ${b.platforms}` : ''}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-(--text-3)">
        {PLATFORMS.map((p) => <span key={p}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: PLATFORM_COLOR[p] }} />{PLATFORM_LABEL[p]}</span>)}
        <span>Striped: needs you</span>
      </div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {view === 'month'
            ? <MonthGrid year={date.getFullYear()} month={date.getMonth()} items={shown} selectedId={selectedId} todayMs={Date.now()}
                onSelect={(i) => { setSelectedId(i.id); setMessage(null); }} onDragStart={(i) => setDragId(i.id)} onDropDay={dropOnDay} />
            : <WeekGrid weekStartMs={weekStart} items={shown} selectedId={selectedId}
                onSelect={(i) => { setSelectedId(i.id); setMessage(null); }} onDragStart={(i) => setDragId(i.id)} onDropSlot={dropOnSlot} />}
        </div>
        <CalendarSidePanel item={selected} message={message} onOpenProject={onOpenProject}
          onChange={(atMs) => { if (selected) requestMove(selected, atMs); }}
          onCancel={() => { if (selected) setConfirm({ kind: 'cancel', item: selected }); }} />
      </div>
      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.kind === 'cancel' ? 'Cancel this post?' : 'Change the time?'} size="sm">
        {confirm && (
          <div className="space-y-3 p-4 text-[13px] text-(--text-1)">
            <p>
              {confirm.kind === 'move'
                ? `Move to ${whenLabel(confirm.atMs)}? This changes the time on ${PLATFORM_LABEL[confirm.item.platform]}.`
                : confirm.item.movesOnPlatform
                  ? `Cancel this post on ${PLATFORM_LABEL[confirm.item.platform]}?${confirm.item.platform === 'youtube' ? ' The video stays private on your channel.' : ''}`
                  : 'Cancel this post? It will not go out.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>No</Button>
              <Button size="sm" onClick={confirmNow}>{confirm.kind === 'move' ? 'Move it' : 'Cancel it'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
