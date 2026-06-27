import React from 'react';

interface Permission {
  allowed: string[];
  blocked: string[];
  approvalRequired: string[];
}

interface AgentProfile {
  limitations?: string[];
}

interface Props {
  agentPermissions?: Record<string, Permission>;
  agentProfiles?: Record<string, AgentProfile>;
}

export function AgentCapabilityMatrix({ agentPermissions = {}, agentProfiles = {} }: Props): React.JSX.Element {
  const rows = Object.entries(agentPermissions);
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-3">Capability Matrix</div>
      <div className="space-y-2 text-xs">
        {rows.length === 0 && <div className="text-zinc-500">No permission profile selected.</div>}
        {rows.map(([agentId, permission]) => (
          <div key={agentId} className="rounded-lg border border-white/10 p-2">
            <div className="font-semibold text-zinc-200">{agentId}</div>
            <div className="text-zinc-400">allowed: {permission.allowed.length} | blocked: {permission.blocked.length} | approval: {permission.approvalRequired.length}</div>
            <div className="mt-1 text-zinc-500">can do: {permission.allowed.slice(0, 3).join(', ')}</div>
            <div className="text-zinc-500">cannot do: {permission.blocked.slice(0, 3).join(', ')}</div>
            <div className="text-zinc-500">needs approval: {permission.approvalRequired.slice(0, 3).join(', ')}</div>
            {agentProfiles?.[agentId]?.limitations?.length ? (
              <div className="mt-1 text-amber-200/80">limitations: {agentProfiles[agentId].limitations!.slice(0, 2).join(' | ')}</div>
            ) : null}
            <div className="text-indigo-200/70">unwired: external autonomy disabled by policy.</div>
          </div>
        ))}
      </div>
    </div>
  );
}
