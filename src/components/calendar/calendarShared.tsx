import React from 'react';
import type { CalendarItem, CalendarPlatform } from '../../services/contentFactory/calendarItems';

export const PLATFORM_LABEL: Record<CalendarPlatform, string> = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', other: 'Other' };
export const PLATFORM_COLOR: Record<CalendarPlatform, string> = { youtube: '#e5484d', instagram: '#d6409f', facebook: '#3e63dd', other: '#8d8d8d' };

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const timeLabel = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const startOfDay = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** Monday of the week containing `ms`, local midnight. */
export const startOfWeek = (ms: number) => { const d = new Date(startOfDay(ms)); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime(); };
export const addDays = (ms: number, n: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
export const whenLabel = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** One post on the calendar: platform by colour, brand by its marker, striped when it needs you. */
export function CalendarChip({ item, selected, onSelect, onDragStart }: {
  item: CalendarItem; selected: boolean; onSelect(): void; onDragStart(): void;
}) {
  const color = PLATFORM_COLOR[item.platform];
  const background = item.needsYou
    ? `repeating-linear-gradient(45deg, ${color}, ${color} 4px, rgba(0,0,0,.35) 4px, rgba(0,0,0,.35) 8px)`
    : color;
  return (
    <button
      type="button"
      data-testid={`calendar-item-${item.id}`}
      data-needs-you={item.needsYou ? 'true' : 'false'}
      draggable={item.draggable}
      onDragStart={(e) => { try { e.dataTransfer?.setData('text/plain', item.id); } catch { /* jsdom */ } onDragStart(); }}
      onClick={onSelect}
      aria-pressed={selected}
      title={`${PLATFORM_LABEL[item.platform]} · ${item.brandName} · ${item.title}`}
      className={`mt-0.5 flex w-full items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] text-white ${selected ? 'ring-2 ring-(--accent)' : ''}`}
      style={{ background }}
    >
      <span className="rounded-sm bg-black/35 px-1 text-[8px] font-extrabold" style={{ borderLeft: `3px solid ${item.brandColor}` }}>{item.initials}</span>
      {item.isShort && <span className="rounded-sm bg-black/35 px-1 text-[8px] font-bold">Short</span>}
      <span className="truncate">{item.hasTime ? `${timeLabel(item.atMs)} ${item.title}` : item.title}</span>
    </button>
  );
}
