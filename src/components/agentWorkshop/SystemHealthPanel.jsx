import React, { useEffect, useState } from 'react';
import { getSystemHealthSummary } from '../../services/systemHealth/systemHealthService';

function Item({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-100 mt-1">{value}</div>
    </div>
  );
}

export function SystemHealthPanel() {
  const [health, setHealth] = useState(() => getSystemHealthSummary());

  useEffect(() => {
    const tick = () => setHealth(getSystemHealthSummary());
    tick();
    const timer = window.setInterval(tick, 3000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">System Health</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Item label="Build Status" value={health.buildStatus?.status || 'unknown'} />
        <Item label="Verification" value={health.verificationStatus} />
        <Item label="Pending Approvals" value={health.pendingApprovals} />
        <Item label="Failed Agent Tasks" value={health.failedAgentTasks} />
        <Item label="Dependency Conflicts" value={health.dependencyConflicts} />
        <Item label="Memory Load" value={health.memoryLoad} />
        <Item label="Orchestration Queue" value={health.orchestrationQueue} />
        <Item label="Agent Activity" value={health.agentActivity} />
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">Open proposals: {health.openProposals}</div>
    </div>
  );
}
