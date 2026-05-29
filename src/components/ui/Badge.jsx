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
  const colors = {
    zinc: 'bg-zinc-800/60 text-zinc-400 border-zinc-600/30',
    green: 'bg-emerald-900/40 text-emerald-300 border-emerald-600/30',
    blue: 'bg-blue-900/40 text-blue-300 border-blue-600/30',
    amber: 'bg-amber-900/40 text-amber-300 border-amber-600/30',
    red: 'bg-red-900/40 text-red-300 border-red-600/30',
    indigo: 'bg-indigo-900/40 text-indigo-300 border-indigo-600/30',
    cyan: 'bg-cyan-900/40 text-cyan-300 border-cyan-600/30'
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded border ${colors[color]}`}>
      {children}
    </span>
  );
}

export function StatusDot({ state }) {
  const color = {
    connected: 'bg-emerald-400',
    listening: 'bg-emerald-400',
    connecting: 'bg-blue-400',
    requesting: 'bg-blue-400',
    requesting_permission: 'bg-blue-400',
    permission_granted: 'bg-emerald-400',
    model_missing: 'bg-amber-400',
    no_models: 'bg-amber-400',
    no_microphone: 'bg-amber-400',
    unsupported: 'bg-amber-400',
    timeout: 'bg-amber-400',
    warning: 'bg-amber-400',
    cors: 'bg-red-400',
    not_running: 'bg-red-400',
    disconnected: 'bg-red-400',
    permission_denied: 'bg-red-400',
    error: 'bg-red-400',
    observing: 'bg-emerald-400'
  }[state] || 'bg-zinc-500';
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

export function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-white/5 pb-2">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
  );
}
