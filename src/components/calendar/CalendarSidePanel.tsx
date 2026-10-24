import React, { useEffect, useState } from 'react';
import { Badge, Button } from '../ui';
import { openExternalUrl } from '../../services/browserAutomationService';
import type { CalendarItem } from '../../services/contentFactory/calendarItems';
import { PLATFORM_LABEL, whenLabel } from './calendarShared';

const pad = (n: number) => String(n).padStart(2, '0');
function toInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime() : null;
}

/** The selected post: what it is, when, its status and copy; change its time, cancel it, open its project. */
export function CalendarSidePanel({ item, message, onChange, onCancel, onOpenProject }: {
  item: CalendarItem | null; message: { text: string; manageUrl?: string } | null;
  onChange(atMs: number): void; onCancel(): void; onOpenProject?(projectId: string): void;
}) {
  const [time, setTime] = useState('');
  useEffect(() => { if (item) setTime(toInput(item.atMs)); }, [item?.id, item?.atMs]);
  return (
    <section aria-label="Selected post" className="w-64 shrink-0 space-y-2 rounded-xl border border-(--border) bg-(--surface-1) p-3 text-[12px]">
      {!item && <p className="text-(--text-3)">Pick a post to see it, change its time or cancel it.</p>}
      {item && (
        <>
          <div className="flex items-center gap-2">
            <span className="rounded-sm px-1 text-[10px] font-extrabold text-white" style={{ background: item.brandColor }}>{item.initials}</span>
            <span className="font-semibold text-(--text-1)">{PLATFORM_LABEL[item.platform]} {item.piece}</span>
          </div>
          <div className="text-(--text-2)">{item.brandName}{item.projectName ? ` · ${item.projectName}` : ''}</div>
          <div className="text-(--text-1)">{item.title}</div>
          <div className="text-(--text-3)">{item.hasTime ? whenLabel(item.atMs) : new Date(item.atMs).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <Badge variant={item.needsYou ? 'warning' : 'info'}>{item.statusLabel}</Badge>
          {item.reason && <p className="text-(--text-2)">{item.reason}</p>}
          {item.link && <Button size="sm" variant="ghost" onClick={() => { void openExternalUrl(item.link as string); }}>Open the post</Button>}
          {item.caption && <p className="whitespace-pre-wrap text-(--text-2)">{item.caption}</p>}
          {item.draggable && (
            <div className="flex items-end gap-2">
              <label className="block text-[11px] text-(--text-3)">
                New time
                <input aria-label="New time" type="datetime-local" className="mt-1 block rounded-lg bg-(--surface-2) px-2 py-1 text-(--text-1)" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <Button size="sm" onClick={() => { const at = fromInput(time); if (at) onChange(at); }}>Change</Button>
            </div>
          )}
          {message && (
            <p className="text-(--error)">
              {message.text}
              {message.manageUrl && <> <button type="button" className="underline" onClick={() => { void openExternalUrl(message.manageUrl as string); }}>Open Meta Business Suite</button></>}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.kind === 'post' && item.draggable && <Button size="sm" variant="secondary" onClick={onCancel}>Cancel post</Button>}
            {item.projectId && onOpenProject && <Button size="sm" variant="ghost" onClick={() => onOpenProject(item.projectId as string)}>Open project</Button>}
          </div>
        </>
      )}
    </section>
  );
}
