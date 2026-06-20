import React, { useState } from 'react';

export function ContentCalendar({ drafts = [], onAssignDay, onSelectDraft, onPublish }) {
  const [selectedDate, setSelectedDate] = useState('');
  const scheduled = drafts.filter((draft) => draft.scheduled_date);

  return (
    <div className="space-y-4 rounded-[3rem] border border-primary/20 bg-zinc-950/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">Content calendar</h2>
        <input value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} type="date" className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </div>
      <div className="grid gap-2">
        {scheduled.length === 0 && <div className="rounded-xl border border-white/10 bg-zinc-900/45 p-4 text-sm text-zinc-500">No scheduled drafts yet.</div>}
        {scheduled.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-white/10 bg-zinc-900/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => onSelectDraft?.(draft.id)} className="text-left text-sm font-semibold text-white">{draft.idea || 'Untitled draft'}</button>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100">{draft.scheduled_date} {draft.scheduled_time}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => onPublish?.(draft, 'image')} className="rounded-lg border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Publish image</button>
              <button type="button" onClick={() => onPublish?.(draft, 'video')} className="rounded-lg border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Publish video</button>
              <button type="button" onClick={() => onAssignDay?.(draft.id, selectedDate)} className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">Assign selected date</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
