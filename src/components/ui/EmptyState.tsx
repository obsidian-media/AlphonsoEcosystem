import React from 'react';
interface EmptyStateProps { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; }
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      {icon && <div className="text-[--text-4] w-10 h-10">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-[--text-2]">{title}</p>
        {description && <p className="text-xs text-[--text-3] mt-1 max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}