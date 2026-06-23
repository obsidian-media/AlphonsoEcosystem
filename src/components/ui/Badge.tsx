import React from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; className?: string; dot?: boolean; }

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-3 text-[--text-2] border-[--border]',
  success: 'bg-[--success-dim] text-[--success] border-green-500/20',
  warning: 'bg-[--warning-dim] text-[--warning] border-amber-500/20',
  error: 'bg-[--error-dim] text-[--error] border-red-500/20',
  info: 'bg-[--info-dim] text-[--info] border-sky-500/20',
  accent: 'bg-[--accent-dim] text-accent border-[--accent-border]',
};

export function Badge({ variant = 'default', children, className = '', dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Legacy color-prop API (used by Badge.jsx consumers)
export const statusColors = {
  connected: 'green', connecting: 'blue', model_missing: 'amber', no_models: 'amber',
  timeout: 'amber', cors: 'red', not_running: 'red', disconnected: 'red', idle: 'zinc',
  stopped: 'zinc', requesting: 'blue', requesting_permission: 'blue', permission_granted: 'green',
  listening: 'green', permission_denied: 'red', no_microphone: 'amber', unsupported: 'amber',
  error: 'red', warning: 'amber', observing: 'green',
} as const;

export function StatusDot({ state }: { state?: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-[--success]', listening: 'bg-[--success]', permission_granted: 'bg-[--success]',
    observing: 'bg-[--success]', connecting: 'bg-[--accent]', requesting: 'bg-[--accent]',
    requesting_permission: 'bg-[--accent]', model_missing: 'bg-[--warning]', no_models: 'bg-[--warning]',
    no_microphone: 'bg-[--warning]', unsupported: 'bg-[--warning]', timeout: 'bg-[--warning]',
    warning: 'bg-[--warning]', cors: 'bg-[--error]', not_running: 'bg-[--error]',
    disconnected: 'bg-[--error]', permission_denied: 'bg-[--error]', error: 'bg-[--error]',
  };
  return <span className={`h-2 w-2 rounded-full ${colors[state ?? ''] ?? 'bg-zinc-500'}`} />;
}

export function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[var(--text-3)] font-bold section-label border-b border-[var(--border)] pb-2">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
  );
}