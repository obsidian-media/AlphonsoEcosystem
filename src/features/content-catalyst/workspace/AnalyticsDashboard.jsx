import React from 'react';
import { BarChart3 } from 'lucide-react';

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center">
      <div className="text-base font-bold text-[var(--text-1)] leading-none">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-[var(--text-4)]">{label}</div>
    </div>
  );
}

export function AnalyticsDashboard({ analytics = {} }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <BarChart3 className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-3)]">Analytics</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total" value={analytics.total || 0} />
          <Stat label="Ready" value={analytics.ready || 0} />
          <Stat label="Published" value={analytics.published || 0} />
          <Stat label="Video" value={analytics.video || 0} />
          <Stat label="Voice" value={analytics.voice || 0} />
          <Stat label="Failed" value={analytics.failed || 0} />
        </div>
        {Object.keys(analytics.byPlatform || {}).length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] font-bold mb-1.5">By platform</div>
            <div className="space-y-1">
              {Object.entries(analytics.byPlatform).map(([p, n]) => (
                <div key={p} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-3)]">{p}</span>
                  <span className="font-bold text-[var(--text-2)]">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
