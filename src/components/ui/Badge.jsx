import React from 'react';

export const statusColors = {
  connected: 'green',
  connecting: 'blue',
  model_missing: 'amber',
  no_models: 'amber',
  timeout: 'amber',
  cors: 'red',
  not_running: 'red',
  disconnected: 'red',
  idle: 'zinc',
  stopped: 'zinc',
  requesting: 'blue',
  requesting_permission: 'blue',
  permission_granted: 'green',
  listening: 'green',
  permission_denied: 'red',
  no_microphone: 'amber',
  unsupported: 'amber',
  error: 'red',
  warning: 'amber',
  observing: 'green'
};

export function Badge({ children, color = 'zinc' }) {
  const colorMap = {
    zinc: 'badge-neutral',
    green: 'badge-success',
    blue: 'bg-accent/10 text-accent-light border-accent/20',
    amber: 'badge-warning',
    red: 'badge-danger',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
  };
  return (
    <span className={`badge ${colorMap[color] || colorMap.zinc}`}>
      {children}
    </span>
  );
}

export function StatusDot({ state }) {
  const colors = {
    connected: 'bg-success',
    listening: 'bg-success',
    connecting: 'bg-accent',
    requesting: 'bg-accent',
    requesting_permission: 'bg-accent',
    permission_granted: 'bg-success',
    model_missing: 'bg-warning',
    no_models: 'bg-warning',
    no_microphone: 'bg-warning',
    unsupported: 'bg-warning',
    timeout: 'bg-warning',
    warning: 'bg-warning',
    cors: 'bg-danger',
    not_running: 'bg-danger',
    disconnected: 'bg-danger',
    permission_denied: 'bg-danger',
    error: 'bg-danger',
    observing: 'bg-success'
  };
  return <span className={`h-2 w-2 rounded-full ${colors[state] || 'bg-zinc-500'}`} />;
}

export function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 text-zinc-400 font-bold section-label border-b border-white/[0.04] pb-2">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
  );
}
