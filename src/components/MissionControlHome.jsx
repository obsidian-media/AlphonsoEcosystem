import React, { useMemo } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clapperboard, Crown,
  Gauge, MessageSquare, RadioTower, Shield, Sparkles, Terminal, ArrowRight
} from 'lucide-react';
import { listApprovalQueue, listAgentPackets } from '../services/agentBusService';
import { listAgentActivity } from '../services/agentActivityService';
import alphonsoBanner from '../../logo-banner-thumbnail-media/ALPHONSO_BANNER.webp';
import alphonsoIcon from '../../logo-banner-thumbnail-media/ALPHONSO_ICON.webp';
import alphonsoLogo from '../../logo-banner-thumbnail-media/ALPHONSO_LOGO.webp';

export function MissionControlHome({
  settings,
  ollamaStatus,
  operatorMode,
  coachMode,
  coachIntervention,
  verificationLogs = [],
  memoryItems = [],
  updateCheckState,
  onNavigate
}) {
  const snapshot = useMemo(() => {
    const approvals = listApprovalQueue();
    const packets = listAgentPackets();
    const activity = listAgentActivity().slice(-5).reverse();
    const recentLogs = verificationLogs.slice(-5).reverse();
    return { approvals, packets, activity, recentLogs };
  }, [verificationLogs]);

  const nextActions = useMemo(() => {
    const items = [];
    if (snapshot.approvals.length > 0) {
      items.push({ title: 'Review approvals', detail: `${snapshot.approvals.length} agent handoff${snapshot.approvals.length === 1 ? '' : 's'} need a decision`, cta: 'Open Jose', tab: 'orchestrator', icon: Crown, accent: 'text-[var(--warning)]' });
    }
    if (coachIntervention?.level === 'hard' || coachIntervention?.level === 'firm') {
      items.push({ title: 'Coach intervention', detail: coachIntervention.message || 'Active protective intervention', cta: 'Open Operator', tab: 'operator', icon: Shield, accent: 'text-[var(--error)]' });
    }
    if (ollamaStatus?.state !== 'connected') {
      items.push({ title: 'Start Ollama', detail: 'Local AI is not running — agent reasoning is limited', cta: 'Open Settings', tab: 'settings', icon: Terminal, accent: 'text-[var(--text-3)]' });
    }
    items.push({ title: 'Continue your mission', detail: 'Use Project Execution for structured work packets and proof-first planning', cta: 'Open Project Exec', tab: 'project_execution', icon: Sparkles, accent: 'text-[var(--accent)]' });
    items.push({ title: 'Talk to Alphonso', detail: 'Direct commands, research, and Jose delegation', cta: 'Open Chat', tab: 'chat', icon: MessageSquare, accent: 'text-cyan-400' });
    return items.slice(0, 4);
  }, [snapshot.approvals.length, coachIntervention, ollamaStatus]);

  const feed = useMemo(() => {
    const activityItems = snapshot.activity.map((item) => ({
      label: `${item.agent || 'agent'}: ${item.action || 'activity'}`,
      detail: item.detail || '',
      ts: item.ts,
    }));
    const logItems = snapshot.recentLogs.map((log) => ({
      label: log.type || 'verification',
      detail: `${log.source || 'system'}`,
      ts: log.timestampMs,
    }));
    return [...activityItems, ...logItems]
      .filter((item) => item.ts)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 6);
  }, [snapshot.activity, snapshot.recentLogs]);

  const ollamaConnected = ollamaStatus?.state === 'connected';

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl">
        <img
          src={alphonsoBanner}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25 saturate-110"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_50%)]" />
        <div className="relative px-8 py-10 md:px-12 md:py-14">
          <div className="flex items-center gap-2.5 mb-6">
            <img src={alphonsoIcon} alt="" className="h-7 w-7 rounded-full object-cover" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[var(--text-2)]">Alphonso</span>
            <span className="h-1 w-1 rounded-full bg-zinc-700" />
            <span className={`text-[11px] font-semibold ${ollamaConnected ? 'text-[var(--success)]' : 'text-[var(--text-4)]'}`}>
              {ollamaConnected ? 'Local AI online' : 'Local AI offline'}
            </span>
          </div>
          <img src={alphonsoLogo} alt="Alphonso" className="mb-5 h-10 object-contain object-left" />
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
            Executor online.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-2)]">
            Coordinate your 9 agents, manage approvals, and keep the next move clear.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate?.('chat')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              Open Chat
            </button>
            <button
              onClick={() => onNavigate?.('orchestrator')}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--text-1)] hover:bg-white/10 transition-colors"
            >
              <Crown className="h-4 w-4" />
              Orchestrator
            </button>
          </div>
        </div>
      </div>

      {/* ── Status strip ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: 'Local AI',
            value: ollamaConnected ? 'Online' : 'Offline',
            dot: ollamaConnected ? 'bg-emerald-400' : 'bg-zinc-600',
            sub: ollamaStatus?.label || 'Ollama',
          },
          {
            label: 'Approvals',
            value: snapshot.approvals.length || '—',
            dot: snapshot.approvals.length ? 'bg-amber-400' : 'bg-zinc-700',
            sub: snapshot.approvals.length ? 'waiting' : 'queue clear',
          },
          {
            label: 'Coach',
            value: coachMode ? 'On' : 'Off',
            dot: coachIntervention ? 'bg-red-400' : coachMode ? 'bg-cyan-400' : 'bg-zinc-700',
            sub: coachIntervention ? `${coachIntervention.level} intervention` : 'no intervention',
          },
          {
            label: 'Memory',
            value: memoryItems.length,
            dot: 'bg-violet-400',
            sub: updateCheckState?.available ? 'update ready' : 'up to date',
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.07] bg-[var(--surface-1)] px-4 py-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-3)]">{s.label}</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-1)]">{s.value}</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-4)]">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Next actions + recent feed ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">

        {/* Next actions */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">What to do next</h2>
          </div>
          <div className="space-y-2">
            {nextActions.map((action) => (
              <button
                key={`${action.tab}-${action.title}`}
                type="button"
                onClick={() => onNavigate?.(action.tab)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3.5 text-left transition hover:border-white/[0.10] hover:bg-[var(--surface-2)]"
              >
                <action.icon className={`h-4 w-4 shrink-0 ${action.accent}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-1)]">{action.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-3)] truncate">{action.detail}</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-4)] group-hover:text-[var(--text-2)] transition-colors shrink-0">
                  {action.cta}
                  <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent pulse */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Recent activity</h2>
            <Activity className="h-3.5 w-3.5 text-[var(--text-4)]" />
          </div>
          {feed.length === 0 ? (
            <p className="text-[12px] text-[var(--text-4)]">No activity yet. Run a command or task to see it here.</p>
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <div key={`${item.label}-${item.ts}`}>
                  <div className="text-[12px] font-medium text-[var(--text-1)] leading-snug">{item.label}</div>
                  {item.detail && <div className="text-[11px] text-[var(--text-4)] mt-0.5">{item.detail}</div>}
                  <div className="text-[10px] text-zinc-700 mt-0.5">
                    {new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick launch ── */}
      <div>
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Quick launch</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { title: 'Miya Studio', detail: 'Create images and video locally', tab: 'miya', icon: Clapperboard, color: 'text-fuchsia-400' },
            { title: 'Connectors', detail: 'Telegram, Slack, YouTube and more', tab: 'connectors', icon: RadioTower, color: 'text-cyan-400' },
            { title: 'Operator', detail: 'Settings, Coach, and memory', tab: 'operator', icon: Bot, color: 'text-violet-400' },
          ].map((item) => (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate?.(item.tab)}
              className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3.5 text-left transition hover:border-white/[0.10] hover:bg-[var(--surface-2)]"
            >
              <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
              <div>
                <div className="text-sm font-semibold text-[var(--text-1)]">{item.title}</div>
                <div className="text-[11px] text-[var(--text-4)] mt-0.5">{item.detail}</div>
              </div>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-zinc-700 group-hover:text-[var(--text-2)] transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
