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