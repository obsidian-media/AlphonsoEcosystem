import React from 'react';
import { BarChart3, Radar, Settings, Zap } from 'lucide-react';

export function BrandHeader({ brandProfile, analytics, onToggleSettings, onToggleTrends, onToggleAnalytics, showSettings, showTrends, showAnalytics }) {
  return (
    <header className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-5 py-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-400">Content Catalyst</span>
          </div>
          <h1 className="mt-1 text-base font-bold text-[var(--text-1)] truncate">
            {brandProfile?.brand_name ? brandProfile.brand_name : 'Idea → Brief → Draft → Publish'}
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {[
            { label: 'Jobs', value: analytics.total },
            { label: 'Ready', value: analytics.ready },
            { label: 'Live', value: analytics.published },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-base font-bold text-[var(--text-1)] leading-none">{value}</div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--text-4)] mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Settings', icon: Settings, active: showSettings, onClick: onToggleSettings },
            { label: 'Trends', icon: Radar, active: showTrends, onClick: onToggleTrends },
            { label: 'Analytics', icon: BarChart3, active: showAnalytics, onClick: onToggleAnalytics },
          ].map(({ label, icon: Icon, active, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                active
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300'
                  : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
