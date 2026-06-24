import React from 'react';
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}
const variantClasses: Record<Variant, string> = {
  primary:   'bg-[var(--accent)] text-[var(--surface-0)] hover:bg-[var(--accent-hover)] border-transparent',
  secondary: 'bg-[var(--surface-3)] text-[var(--text-1)] hover:bg-[var(--surface-4)] border-[var(--border)]',
  ghost:     'bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] border-transparent',
  danger:    'bg-[var(--error-dim)] text-[var(--error)] hover:bg-[var(--error-dim)] border-[var(--error)]/30',
  success:   'bg-[var(--success-dim)] text-[var(--success)] hover:bg-[var(--success-dim)] border-[var(--success)]/30',
};
const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5',
  md: 'px-3.5 py-1.5 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2.5',
};
export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium border rounded-[var(--radius-md)] transition-all duration-[var(--duration-normal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icon}
      {children}
    </button>
  );
}
