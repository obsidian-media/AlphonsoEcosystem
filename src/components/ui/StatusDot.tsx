import React from 'react';
type Status = 'online' | 'offline' | 'pending' | 'error' | 'warning';
const statusClasses: Record<Status, string> = {
  online: 'bg-[--success]',
  offline: 'bg-[--text-4]',
  pending: 'bg-[--warning] animate-pulse',
  error: 'bg-[--error]',
  warning: 'bg-[--warning]',
};
export function StatusDot({ status, size = 'sm' }: { status: Status; size?: 'sm' | 'md' }) {
  return <span className={`inline-block rounded-full ${statusClasses[status]} ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'}`} />;
}