import React from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
}
export function Input({ label, hint, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[--text-2]">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[--text-3]">{icon}</span>}
        <input
          {...props}
          className={`w-full bg-[--surface-3] border ${error ? 'border-red-500/50' : 'border-[--border]'} rounded-[--radius-md] px-3 py-2 text-sm text-[--text-1] placeholder:text-[--text-3] focus:outline-none focus:border-[--accent-border] focus:ring-1 focus:ring-accent/30 transition-colors duration-[--duration-fast] ${icon ? 'pl-9' : ''} ${className}`}
        />
      </div>
      {error && <p className="text-xs text-[--error]">{error}</p>}
      {hint && !error && <p className="text-xs text-[--text-3]">{hint}</p>}
    </div>
  );
}