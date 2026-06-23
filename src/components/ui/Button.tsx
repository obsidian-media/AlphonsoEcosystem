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
  primary: 'bg-accent text-white hover:bg-accent-hover border-transparent',
  secondary: 'bg-surface-3 text-[--text-1] hover:bg-surface-4 border-[--border]',
  ghost: 'bg-transparent text-[--text-2] hover:bg-surface-3 hover:text-[--text-1] border-transparent',
  danger: 'bg-[--error-dim] text-[--error] hover:bg-red-500/20 border-red-500/30',
  success: 'bg-[--success-dim] text-[--success] hover:bg-green-500/20 border-green-500/30',
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
      className={`inline-flex items-center justify-center font-medium border rounded-[--radius-md] transition-all duration-[--duration-normal] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icon}
      {children}
    </button>
  );
}