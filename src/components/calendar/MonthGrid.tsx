import React from 'react';
import type { CalendarItem } from '../../services/contentFactory/calendarItems';
import { addDays, CalendarChip, dayKey, startOfDay, startOfWeek } from './calendarShared';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Six weeks from the Monday before the month's first day; drop on a day to move there. */
export function MonthGrid({ year, month, items, selectedId, todayMs, onSelect, onDragStart, onDropDay }: {
  year: number; month: number; items: CalendarItem[]; selectedId: string | null; todayMs: number;
  onSelect(item: CalendarItem): void; onDragStart(item: CalendarItem): void; onDropDay(dayStartMs: number): void;
}) {
  const first = startOfWeek(new Date(year, month, 1).getTime());
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dayKey(item.atMs);
    byDay.set(key, [...(byDay.get(key) || []), item]);
  }
  const today = dayKey(todayMs);
  return (
    <div className="grid grid-cols-7 gap-1 text-[10px]">
      {WEEKDAYS.map((d) => <div key={d} className="py-1 text-center font-bold text-(--text-3)">{d}</div>)}
      {days.map((day) => {
        const key = dayKey(day);
        const inMonth = new Date(day).getMonth() === month;
        return (
          <div
            key={key}
            data-testid={`calendar-day-${key}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onDropDay(startOfDay(day)); }}
            className={`min-h-20 rounded-lg border border-(--border) p-1 ${inMonth ? '' : 'opacity-50'} ${key === today ? 'outline outline-2 outline-(--accent-border)' : ''}`}
          >
            <div className="text-(--text-3)">{new Date(day).getDate()}</div>
            {(byDay.get(key) || []).map((item) => (
              <CalendarChip key={item.id} item={item} selected={selectedId === item.id} onSelect={() => onSelect(item)} onDragStart={() => onDragStart(item)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
