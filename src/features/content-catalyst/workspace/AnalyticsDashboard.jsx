import React from 'react';

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export function AnalyticsDashboard({ analytics = {} }) {
  return (
    <div className="space-y-4 rounded-[3rem] border border-primary/20 bg-zinc-950/90 p-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Analytics</h2>
        <p className="mt-2 text-sm text-zinc-400">History and delivery summary for the content workspace.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Stat label="Total" value={analytics.total || 0} />
        <Stat label="Ready" value={analytics.ready || 0} />
        <Stat label="Video" value={analytics.video || 0} />
        <Stat label="Voice" value={analytics.voice || 0} />
        <Stat label="Published" value={analytics.published || 0} />
        <Stat label="Failed" value={analytics.failed || 0} />
      </div>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/45 p-4 text-sm text-zinc-300">
        <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">By platform</div>
        <pre className="mt-2 overflow-auto text-[11px] text-zinc-200">{JSON.stringify(analytics.byPlatform || {}, null, 2)}</pre>
      </div>
    </div>
  );
}
