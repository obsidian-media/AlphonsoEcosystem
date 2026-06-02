import React, { useMemo } from 'react';
import { Activity, AlertTriangle, Bot, CheckCircle2, Clapperboard, Crown, Gauge, MessageSquare, RadioTower, Shield, Sparkles, Terminal } from 'lucide-react';
import { listApprovalQueue, listAgentPackets } from '../services/agentBusService';
import { listAgentActivity } from '../services/agentActivityService';
import alphonsoBanner from '../../logo-banner-thumbnail-media/ALPHONSO_BANNER.png';
import alphonsoIcon from '../../logo-banner-thumbnail-media/ALPHONSO_ICON.png';
import alphonsoLogo from '../../logo-banner-thumbnail-media/ALPHONSO_LOGO.png';
import alphonsoThumbnail from '../../logo-banner-thumbnail-media/ALPHONSO_THUMBNAIL.png';

function toneClass(tone = 'zinc') {
  if (tone === 'green') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100';
  if (tone === 'amber') return 'border-amber-400/20 bg-amber-500/10 text-amber-100';
  if (tone === 'red') return 'border-red-400/20 bg-red-500/10 text-red-100';
  if (tone === 'cyan') return 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100';
  if (tone === 'fuchsia') return 'border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100';
  return 'border-white/10 bg-zinc-900/50 text-zinc-200';
}

function StatCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClass(tone)}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-75">{label}</div>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs opacity-70">{detail}</div>
    </div>
  );
}

function ActionCard({ title, detail, cta, tab, icon: Icon, tone, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(tab)}
      className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)] ${toneClass(tone)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{title}</div>
          <div className="mt-1 text-xs leading-relaxed opacity-70">{detail}</div>
        </div>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
      <div className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] opacity-80 group-hover:opacity-100">{cta}</div>
    </button>
  );
}

function FeedItem({ label, detail, time, tone = 'zinc' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/45 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-zinc-100">{label}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{detail}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${toneClass(tone)}`}>{time}</span>
      </div>
    </div>
  );
}

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
    const activity = listAgentActivity().slice(-6).reverse();
    const recentLogs = verificationLogs.slice(-6).reverse();
    return { approvals, packets, activity, recentLogs };
  }, [verificationLogs]);

  const nextActions = useMemo(() => {
    const items = [];
    if (snapshot.approvals.length > 0) {
      items.push({ title: 'Review pending approvals', detail: `${snapshot.approvals.length} agent handoff${snapshot.approvals.length === 1 ? '' : 's'} need a decision.`, cta: 'Open Jose', tab: 'orchestrator', icon: Crown, tone: 'amber' });
    }
    if (coachIntervention?.level === 'hard' || coachIntervention?.level === 'firm') {
      items.push({ title: 'Check Coach intervention', detail: coachIntervention.message || 'Coach has an active protective intervention.', cta: 'Open Operator', tab: 'operator', icon: Shield, tone: coachIntervention.level === 'hard' ? 'red' : 'amber' });
    }
    if (ollamaStatus?.state !== 'connected') {
      items.push({ title: 'Restore local runtime', detail: `Ollama is ${ollamaStatus?.label || 'not verified'}. Local chat quality may be limited.`, cta: 'Open Settings', tab: 'settings', icon: Terminal, tone: 'red' });
    }
    if (settings?.zeroCostMode) {
      items.push({ title: 'Zero-cost mode is protecting spend', detail: 'Cloud lanes such as Qwen remain blocked unless intentionally approved.', cta: 'Open Connectors', tab: 'connectors', icon: RadioTower, tone: 'cyan' });
    }
    items.push({ title: 'Continue building the mission', detail: 'Use Project Execution for structured work packets and proof-first planning.', cta: 'Open Project Exec', tab: 'project_execution', icon: Sparkles, tone: 'fuchsia' });
    return items.slice(0, 4);
  }, [snapshot.approvals.length, coachIntervention, ollamaStatus, settings?.zeroCostMode]);

  const feed = useMemo(() => {
    const activityItems = snapshot.activity.map((item) => ({
      label: `${item.agent || 'agent'}: ${item.action || 'activity'}`,
      detail: item.detail || 'No detail recorded.',
      ts: item.ts,
      tone: 'cyan'
    }));
    const logItems = snapshot.recentLogs.map((log) => ({
      label: log.type || 'verification',
      detail: `${log.source || 'system'} · ${log.trust || 'unverified'}`,
      ts: log.timestampMs,
      tone: log.trust === 'verified' ? 'green' : 'zinc'
    }));
    return [...activityItems, ...logItems]
      .filter((item) => item.ts)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }, [snapshot.activity, snapshot.recentLogs]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-6 alphonso-premium-ui">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 shadow-[0_0_90px_rgba(0,0,0,0.34)]">
        <div className="relative min-h-[420px] p-6 md:p-8">
          <img src={alphonsoBanner} alt="ALPHONSO command banner" className="absolute inset-0 h-full w-full object-cover opacity-35 saturate-125" />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/82 to-zinc-950/35" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.16),transparent_34%)]" />
          <div className="relative flex min-h-[360px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/20 bg-black/40 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100 backdrop-blur-md">
                <img src={alphonsoIcon} alt="" className="h-6 w-6 rounded-full object-cover" /> ALPHONSO Command
              </div>
              <img src={alphonsoLogo} alt="ALPHONSO" className="mt-5 max-h-24 max-w-[24rem] rounded-2xl object-cover object-left shadow-[0_0_45px_rgba(34,211,238,0.12)]" />
              <h1 className="mt-5 text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">Executor online.</h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300/90">
                ALPHONSO is the main operator: execute locally, coordinate Jose, watch Coach, and keep the next move obvious.
              </p>
            </div>
            <div className="w-full max-w-sm rounded-[1.5rem] border border-white/10 bg-black/35 p-3 shadow-[0_0_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <img src={alphonsoThumbnail} alt="ALPHONSO thumbnail" className="h-40 w-full rounded-2xl object-cover" />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Mode</div>
                <div className="mt-1 font-bold text-zinc-100">{settings?.focusMode || 'mission_control'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Railway</div>
                <div className="mt-1 font-bold text-emerald-200">auto-deploy</div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Gauge} label="Runtime" value={ollamaStatus?.label || 'unknown'} detail="Local Ollama lane" tone={ollamaStatus?.state === 'connected' ? 'green' : 'red'} />
        <StatCard icon={Crown} label="Approvals" value={snapshot.approvals.length} detail="Jose decisions waiting" tone={snapshot.approvals.length ? 'amber' : 'green'} />
        <StatCard icon={Shield} label="Coach" value={coachMode ? 'on' : 'off'} detail={coachIntervention ? `${coachIntervention.level} intervention` : 'No active intervention'} tone={coachIntervention?.level === 'hard' ? 'red' : coachMode ? 'cyan' : 'zinc'} />
        <StatCard icon={Bot} label="Operator" value={operatorMode ? 'on' : 'off'} detail={`${memoryItems.length} memory items · updates ${updateCheckState?.available ? 'ready' : 'clear'}`} tone={operatorMode ? 'green' : 'zinc'} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Next Actions</div>
              <div className="mt-1 text-sm text-zinc-400">The app’s recommended loop right now.</div>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-300/70" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {nextActions.map((action) => <ActionCard key={`${action.tab}-${action.title}`} {...action} onNavigate={onNavigate} />)}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Recent Pulse</div>
              <div className="mt-1 text-sm text-zinc-400">Agent activity and verification receipts.</div>
            </div>
            <Activity className="h-5 w-5 text-cyan-300/70" />
          </div>
          <div className="space-y-2">
            {feed.length === 0 && <FeedItem label="No recent pulse yet" detail="Run a chat, proof, or Jose task and it will appear here." time="idle" />}
            {feed.map((item) => (
              <FeedItem
                key={`${item.label}-${item.ts}`}
                label={item.label}
                detail={item.detail}
                time={new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                tone={item.tone}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ActionCard title="Talk to ALPHONSO" detail="Use chat for direct commands and Jose delegation." cta="Open Chat" tab="chat" icon={MessageSquare} tone="cyan" onNavigate={onNavigate} />
        <ActionCard title="Create with Miya" detail="Local media lane and ComfyUI presets live here." cta="Open Miya" tab="miya" icon={Clapperboard} tone="fuchsia" onNavigate={onNavigate} />
        <ActionCard title="Check connectors" detail="Qwen, Notion, Telegram, ComfyUI and public deploy posture." cta="Open Connectors" tab="connectors" icon={RadioTower} tone="amber" onNavigate={onNavigate} />
      </section>
    </div>
  );
}
