import React from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; className?: string; dot?: boolean; }

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-3 text-[var(--text-2)] border-[var(--border)]',
  success: 'bg-[var(--success-dim)] text-[var(--success)] border-[var(--success-border)]',
  warning: 'bg-[var(--warning-dim)] text-[var(--warning)] border-[var(--warning-border)]',
  error: 'bg-[var(--error-dim)] text-[var(--error)] border-[var(--error-border)]',
  info: 'bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)]',
  accent: 'bg-[var(--accent-dim)] text-accent border-[var(--accent-border)]',
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
    connected: 'bg-[var(--success)]', listening: 'bg-[var(--success)]', permission_granted: 'bg-[var(--success)]',
    observing: 'bg-[var(--success)]', connecting: 'bg-[var(--accent)]', requesting: 'bg-[var(--accent)]',
    requesting_permission: 'bg-[var(--accent)]', model_missing: 'bg-[var(--warning)]', no_models: 'bg-[var(--warning)]',
    no_microphone: 'bg-[var(--warning)]', unsupported: 'bg-[var(--warning)]', timeout: 'bg-[var(--warning)]',
    warning: 'bg-[var(--warning)]', cors: 'bg-[var(--error)]', not_running: 'bg-[var(--error)]',
    disconnected: 'bg-[var(--error)]', permission_denied: 'bg-[var(--error)]', error: 'bg-[var(--error)]',
  };
  return <span className={`h-2 w-2 rounded-full ${colors[state ?? ''] ?? 'bg-[var(--text-3)]'}`} />;
}

export function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[var(--text-3)] font-bold section-label border-b border-[var(--border)] pb-2">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
  );
}