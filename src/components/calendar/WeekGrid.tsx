import React from 'react';
import { hoursWithItems, type CalendarItem } from '../../services/contentFactory/calendarItems';
import { addDays, CalendarChip, dayKey } from './calendarShared';

/** A week by the hour: only hours that have posts, plus a "No time" row; drop on a cell to move there. */
export function WeekGrid({ weekStartMs, items, selectedId, onSelect, onDragStart, onDropSlot }: {
  weekStartMs: number; items: CalendarItem[]; selectedId: string | null;
  onSelect(item: CalendarItem): void; onDragStart(item: CalendarItem): void; onDropSlot(dayStartMs: number, hour: number | null): void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartMs, i));
  const hours: (number | null)[] = [...hoursWithItems(items), null];
  const at = (day: number, hour: number | null) => items.filter((item) => dayKey(item.atMs) === dayKey(day)
    && (hour === null ? !item.hasTime : item.hasTime && new Date(item.atMs).getHours() === hour));
  return (
    <div className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: '52px repeat(7, 1fr)' }}>
      <div />
      {days.map((day) => (
        <div key={day} className="py-1 text-center font-bold text-(--text-3)">
          {new Date(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
        </div>
      ))}
      {hours.map((hour) => (
        <React.Fragment key={hour ?? 'none'}>
          <div data-testid={`calendar-hour-${hour ?? 'none'}`} className="pt-1 text-(--text-3)">
            {hour === null ? 'No time' : `${String(hour).padStart(2, '0')}:00`}
          </div>
          {days.map((day) => (
            <div
              key={`${day}-${hour}`}
              data-testid={`calendar-slot-${dayKey(day)}-${hour ?? 'none'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onDropSlot(day, hour); }}
              className="min-h-9 rounded-md border border-(--border) p-0.5"
            >
              {at(day, hour).map((item) => (
                <CalendarChip key={item.id} item={item} selected={selectedId === item.id} onSelect={() => onSelect(item)} onDragStart={() => onDragStart(item)} />
              ))}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
