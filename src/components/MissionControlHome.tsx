import React, { useMemo } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clapperboard, Crown,
  Gauge, MessageSquare, RadioTower, Shield, Sparkles, Terminal, ArrowRight
} from 'lucide-react';
import { listApprovalQueue, listAgentPackets } from '../services/agentBusService';
import { listAgentActivity } from '../services/agentActivityService';
import { getAttentionItems, type AttentionItem } from '../services/attentionAggregatorService';
import { AgentStatusStrip } from './AgentStatusStrip';
import { Zone } from './ui/Zone';

interface OllamaStatus {
  state: string;
  label?: string;
}

interface CoachIntervention {
  level: string;
  message?: string;
}

interface VerificationLog {
  type?: string;
  source?: string;
  timestampMs: number;
}

interface MemoryItem {
  [key: string]: unknown;
}

interface UpdateCheckState {
  available?: boolean;
}

interface Props {
  settings: Record<string, unknown>;
  ollamaStatus: OllamaStatus | null;
  operatorMode: boolean;
  coachMode: boolean;
  coachIntervention: CoachIntervention | null;
  verificationLogs?: VerificationLog[];
  memoryItems?: MemoryItem[];
  updateCheckState?: UpdateCheckState | null;
  onNavigate?: (tab: string) => void;
}

function formatWaitingDuration(oldestTimestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - oldestTimestamp) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
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
}: Props) {
  const snapshot = useMemo(() => {
    const approvals = listApprovalQueue();
    const packets = listAgentPackets();
    const activity = listAgentActivity().slice(-5).reverse();
    const recentLogs = verificationLogs.slice(-5).reverse();
    return { approvals, packets, activity, recentLogs };
  }, [verificationLogs]);

  const [attentionItems, setAttentionItems] = React.useState<AttentionItem[]>([]);
  const [activeAgents, setActiveAgents] = React.useState<{ name: string; status: string }[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const items = await getAttentionItems();
      if (!cancelled) setAttentionItems(items);
    };
    poll();
    const id = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const actionableItems = useMemo(() => attentionItems.filter((item) => item.actionable), [attentionItems]);
  const oldestActionable = actionableItems.length
    ? actionableItems.reduce((oldest, item) => (item.timestamp < oldest.timestamp ? item : oldest))
    : null;

  const ATTENTION_SOURCE_META: Record<AttentionItem['source'], { tab: string; cta: string; icon: React.ComponentType<{ className?: string }> }> = {
    'approval-chat': { tab: 'orchestrator', cta: 'Open Jose', icon: Crown },
    'approval-project': { tab: 'project_execution', cta: 'Open Project Exec', icon: Sparkles },
    connector: { tab: 'connectors', cta: 'Open Connectors', icon: RadioTower },
  };

  const nextActions = useMemo(() => {
    const items: Array<{
      title: string;
      detail: string;
      cta: string;
      tab: string;
      icon: React.ComponentType<{ className?: string }>;
      accent: string;
    }> = [];

    attentionItems.forEach((item) => {
      const meta = ATTENTION_SOURCE_META[item.source];
      items.push({
        title: item.title,
        detail: item.detail || 'Needs a decision',
        cta: meta.cta,
        tab: meta.tab,
        icon: meta.icon,
        accent: 'text-[var(--warning)]',
      });
    });

    if (coachIntervention?.level === 'hard' || coachIntervention?.level === 'firm') {
      items.push({ title: 'Coach intervention', detail: coachIntervention.message || 'Active protective intervention', cta: 'Open Operator', tab: 'operator', icon: Shield, accent: 'text-[var(--error)]' });
    }
    if (ollamaStatus?.state !== 'connected') {
      items.push({ title: 'Start Ollama', detail: 'Local AI is not running — agent reasoning is limited', cta: 'Open Settings', tab: 'settings', icon: Terminal, accent: 'text-[var(--text-3)]' });
    }
    items.push({ title: 'Continue your mission', detail: 'Use Project Execution for structured work packets and proof-first planning', cta: 'Open Project Exec', tab: 'project_execution', icon: Sparkles, accent: 'text-[var(--accent)]' });
    items.push({ title: 'Talk to Alphonso', detail: 'Direct commands, research, and Jose delegation', cta: 'Open Chat', tab: 'chat', icon: MessageSquare, accent: 'text-[var(--agent-alphonso)]' });
    return items.slice(0, 4);
  }, [attentionItems, coachIntervention, ollamaStatus]);

  const isTrulyEmpty = attentionItems.length === 0
    && coachIntervention?.level !== 'hard'
    && coachIntervention?.level !== 'firm'
    && ollamaStatus?.state === 'connected';

  const feed = useMemo(() => {
    const activityItems = snapshot.activity.map((item: { agent?: string; action?: string; detail?: string; ts?: number }) => ({
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
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, 6);
  }, [snapshot.activity, snapshot.recentLogs]);

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">

      <div className="relative overflow-hidden rounded-3xl bg-[var(--surface-1)] px-8 py-6 md:px-12 md:py-8">
        <div className="mb-6">
          <AgentStatusStrip variant="portraits" useAutoFeed onAgentsChange={setActiveAgents} />
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--text-1)] md:text-5xl">
          {getGreeting()}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-2)]">
          Coordinate your 9 agents, manage approvals, and keep the next move clear.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate?.('chat')}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            Open Chat
          </button>
          <button
            onClick={() => onNavigate?.('orchestrator')}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-5 py-2.5 text-sm font-semibold text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <Crown className="h-4 w-4" />
            Orchestrator
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-[var(--surface-1)] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${actionableItems.length ? 'bg-[var(--warning)]' : 'bg-[var(--border-strong)]'}`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Approvals</span>
          </div>
          <div className="text-xl font-bold text-[var(--text-1)]">{actionableItems.length || '—'}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-4)]">
            {oldestActionable ? `oldest waiting ${formatWaitingDuration(oldestActionable.timestamp)}` : 'queue clear'}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-1)] px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${activeAgents.length ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Active agents</span>
          </div>
          <div className="text-xl font-bold text-[var(--text-1)]">{activeAgents.length}/9</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-4)] truncate">
            {activeAgents.length
              ? activeAgents.map((a) => a.name.charAt(0).toUpperCase() + a.name.slice(1)).join(', ')
              : 'idle'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">

        <Zone mood={isTrulyEmpty ? 'cool' : 'warm'}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">What to do next</h2>
          </div>
          {isTrulyEmpty && (
            <div className="mb-4 flex flex-col items-center text-center py-4">
              <CheckCircle2 className="h-6 w-6 text-[var(--accent)] mb-2" />
              <div className="text-sm font-semibold text-[var(--text-1)]">Nothing needs you right now</div>
              <p className="mt-1 max-w-xs text-[12px] text-[var(--text-4)]">Everything's running clean. Try Quick Launch below for something to work on.</p>
            </div>
          )}
          <div className="space-y-2">
            {nextActions.map((action) => (
              <button
                key={`${action.tab}-${action.title}`}
                type="button"
                onClick={() => onNavigate?.(action.tab)}
                className="group flex w-full items-center gap-4 rounded-2xl bg-[var(--surface-1)] px-4 py-3.5 text-left transition hover:bg-[var(--surface-2)]"
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
        </Zone>

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
                  <div className="text-[10px] text-[var(--text-4)] mt-0.5">
                    {item.ts ? new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Zone mood="cool">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-3)]">Quick launch</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { title: 'Miya Studio', detail: 'Create images and video locally', tab: 'miya', icon: Clapperboard, color: 'text-[var(--agent-miya)]' },
            { title: 'Connectors', detail: 'Telegram, Slack, YouTube and more', tab: 'connectors', icon: RadioTower, color: 'text-cyan-400' },
            { title: 'Operator', detail: 'Settings, Coach, and memory', tab: 'operator', icon: Bot, color: 'text-violet-400' },
          ].map((item) => (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate?.(item.tab)}
              className="group flex items-center gap-3 rounded-2xl bg-[var(--surface-1)] px-4 py-3.5 text-left transition hover:bg-[var(--surface-2)]"
            >
              <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} />
              <div>
                <div className="text-sm font-semibold text-[var(--text-1)]">{item.title}</div>
                <div className="text-[11px] text-[var(--text-4)] mt-0.5">{item.detail}</div>
              </div>
              <ArrowRight className="ml-auto h-3.5 w-3.5 text-[var(--text-4)] group-hover:text-[var(--text-2)] transition-colors shrink-0" />
            </button>
          ))}
        </div>
      </Zone>
    </div>
    </div>
  );
}
