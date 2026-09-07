import React from 'react';

interface Output {
  id: string;
  title: string;
  agentId: string;
  summary: string;
  status: string;
  confidence: string;
  riskLevel: string;
}

interface Props {
  outputs?: Output[];
}

export function AgentOutputPanel({ outputs = [] }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-0)] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-3)] font-bold mb-3">Agent Outputs</div>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {outputs.length === 0 && <div className="text-sm text-[var(--text-3)]">No outputs yet.</div>}
        {outputs.map((output) => (
          <div key={output.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[var(--text-1)]">{output.title}</div>
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">{output.agentId}</span>
            </div>
            <div className="text-xs text-[var(--text-2)] mt-1">{output.summary}</div>
            <div className="text-[11px] text-[var(--text-3)] mt-1">status: {output.status} | confidence: {output.confidence} | risk: {output.riskLevel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
