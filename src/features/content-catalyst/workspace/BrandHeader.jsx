import React from 'react';
import { BarChart3, Radar, Settings } from 'lucide-react';

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

export function BrandHeader({
  brandProfile,
  analytics,
  onToggleSettings,
  onToggleTrends,
  onToggleAnalytics,
  showSettings,
  showTrends,
  showAnalytics
}) {
  return (
    <header className="rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-zinc-950 via-cyan-950/20 to-zinc-950 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">Content Catalyst</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            {brandProfile?.brand_name ? `${brandProfile.brand_name} content workspace` : 'Idea to publish-ready content pipeline'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
            Alphonso handles briefing, draft generation, image/video/narration assets, preview packaging, and approval-gated publishing.
            ACC can orchestrate the job and read status; Alphonso keeps the media pipeline modular.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:min-w-[28rem]">
          <Stat label="Jobs" value={analytics.total} />
          <Stat label="Ready" value={analytics.ready} />
          <Stat label="Published" value={analytics.published} />
          <Stat label="Blocked" value={analytics.failed} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onToggleSettings} className={`rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${showSettings ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-zinc-900 text-zinc-300'}`}>
          <Settings className="mr-1 inline h-3.5 w-3.5" /> Settings
        </button>
        <button type="button" onClick={onToggleTrends} className={`rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${showTrends ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-zinc-900 text-zinc-300'}`}>
          <Radar className="mr-1 inline h-3.5 w-3.5" /> Trends
        </button>
        <button type="button" onClick={onToggleAnalytics} className={`rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${showAnalytics ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-zinc-900 text-zinc-300'}`}>
          <BarChart3 className="mr-1 inline h-3.5 w-3.5" /> Analytics
        </button>
      </div>
    </header>
  );
}
