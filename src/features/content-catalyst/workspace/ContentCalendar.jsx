import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export function ContentCalendar({ drafts = [], onAssignDay, onSelectDraft, onPublish }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState('');
  const [expanded, setExpanded] = useState(true);

  const scheduled = drafts.filter((d) => d.scheduled_date);
  const scheduledMap = {};
  scheduled.forEach((d) => {
    const key = d.scheduled_date?.slice(0, 10);
    if (key) { scheduledMap[key] = scheduledMap[key] || []; scheduledMap[key].push(d); }
  });

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const isToday = (day) => day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const dateStr = (day) => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Schedule</span>
        </div>
        <div className="flex items-center gap-1">
          {expanded && (
            <>
              <button onClick={prevMonth} className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="text-xs font-medium text-[var(--text-2)] px-1 min-w-[9rem] text-center">{monthLabel}</span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]"><ChevronRight className="h-3.5 w-3.5" /></button>
            </>
          )}
          <button onClick={() => setExpanded(e => !e)} className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-px">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-[9px] font-bold uppercase tracking-widest text-[var(--text-4)] py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ds = dateStr(day);
              const dots = scheduledMap[ds] || [];
              const sel = selectedDate === ds;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDate(sel ? '' : ds)}
                  className={`relative rounded-lg p-1.5 text-center text-xs transition-colors ${
                    isToday(day) ? 'bg-[var(--accent)] text-[var(--surface-0)] font-bold' :
                    sel ? 'bg-[var(--accent-muted)] text-[var(--accent)] font-semibold' :
                    'hover:bg-[var(--surface-3)] text-[var(--text-2)]'
                  }`}
                >
                  {day}
                  {dots.length > 0 && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dots.slice(0, 3).map((_, di) => (
                        <span key={di} className="h-1 w-1 rounded-full bg-cyan-400" />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected date drafts */}
          {selectedDate && scheduledMap[selectedDate] && (
            <div className="space-y-1.5 pt-1 border-t border-[var(--border)]">
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold">{selectedDate}</div>
              {scheduledMap[selectedDate].map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                  <button onClick={() => onSelectDraft?.(d.id)} className="text-xs text-[var(--text-1)] font-medium text-left truncate max-w-[10rem]">{d.idea || 'Untitled'}</button>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onPublish?.(d, 'image')} className="text-[9px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-3)] hover:text-[var(--text-1)]">Img</button>
                    <button onClick={() => onPublish?.(d, 'video')} className="text-[9px] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-3)] hover:text-[var(--text-1)]">Vid</button>
                    <button onClick={() => onAssignDay?.(d.id, selectedDate)} className="text-[9px] border border-cyan-400/30 rounded px-1.5 py-0.5 text-cyan-400">Assign</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Assign selected date to active draft */}
          {selectedDate && !scheduledMap[selectedDate] && (
            <div className="pt-1 border-t border-[var(--border)]">
              <p className="text-[10px] text-[var(--text-4)]">No drafts on {selectedDate} — select a draft above then click Assign.</p>
            </div>
          )}

          {scheduled.length === 0 && !selectedDate && (
            <p className="text-[10px] text-[var(--text-4)] py-1">No scheduled drafts — click a day to select it, then assign a draft.</p>
          )}
        </div>
      )}

      {!expanded && scheduled.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-[10px] text-[var(--text-3)]">{scheduled.length} scheduled draft{scheduled.length > 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}
