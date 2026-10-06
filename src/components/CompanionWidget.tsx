import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Shield,
  Sparkles,
} from 'lucide-react';
import mascotImage from '../assets/agents/alphonso/portrait.jpg';

const stateStyles: Record<string, {
  ring: string;
  glow: string;
  badge: typeof Sparkles;
  badgeClass: string;
  animation: string;
}> = {
  idle: {
    ring: 'ring-white/10',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-breathe'
  },
  listening: {
    ring: 'ring-red-300/20',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-listening'
  },
  thinking: {
    ring: 'ring-indigo-300/20',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-breathe'
  },
  coding: {
    ring: 'ring-blue-300/20',
    glow: 'shadow-none',
    badge: Code2,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-code'
  },
  task_complete: {
    ring: 'ring-emerald-300/20',
    glow: 'shadow-none',
    badge: CheckCircle2,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-breathe'
  },
  warning: {
    ring: 'ring-amber-300/20',
    glow: 'shadow-none',
    badge: AlertTriangle,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-warning'
  },
  approval_required: {
    ring: 'ring-fuchsia-300/20',
    glow: 'shadow-none',
    badge: AlertTriangle,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-approval'
  },
  privacy_shield_active: {
    ring: 'ring-emerald-300/20',
    glow: 'shadow-none',
    badge: Shield,
    badgeClass: 'bg-(--surface-3) text-(--text-2) border-(--border)',
    animation: 'alphonso-breathe'
  },
  sleeping: {
    ring: 'ring-zinc-600/25',
    glow: 'shadow-none',
    badge: Sparkles,
    badgeClass: 'bg-(--surface-3) text-(--text-3) border-(--border)',
    animation: 'opacity-60'
  }
};

interface Props {
  state: string;
  message?: string;
  pinned?: boolean;
  onOpenDesktopCard?: (() => void) | null;
}

export function CompanionWidget({ state, message, pinned = true, onOpenDesktopCard = null }: Props) {
  const style = stateStyles[state] || stateStyles.idle;
  const BadgeIcon = style.badge;

  return (
    <div className={`${pinned ? 'fixed bottom-4 right-4 z-30' : 'relative'} pointer-events-none`}>
      <div className="pointer-events-auto w-56 rounded-xl border border-(--border) bg-(--surface-0) shadow-xl backdrop-blur-xl overflow-hidden px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${style.badgeClass}`}>
            <BadgeIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-(--agent-alphonso)">Alphonso</div>
            <div className="text-[11px] text-(--agent-alphonso) truncate">{message}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
