import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';

const PAIRS_KEY = 'alphonso_agent_pairs_v1';

interface AgentPair {
  id: string;
  agentA: string;
  agentB: string;
  triggerOn: string;
  note: string;
  createdAt: number;
}

interface AgentProfile {
  id: string;
  name: string;
  role?: string;
}

interface PairForm {
  triggerOn: string;
  note: string;
}

function readPairs(): AgentPair[] {
  try {
    const raw = localStorage.getItem(PAIRS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePairs(list: AgentPair[]) {
  localStorage.setItem(PAIRS_KEY, JSON.stringify(list));
}

const ROLE_COLORS: Record<string, string> = {
  orchestrator: 'text-violet-400',
  analyst: 'text-blue-400',
  researcher: 'text-sky-400',
  governance: 'text-amber-400',
  distribution: 'text-emerald-400',
  memory: 'text-teal-400',
  security: 'text-red-400',
  insight: 'text-pink-400',
  assistant: 'text-zinc-300',
};

interface AgentCardProps {
  agent: AgentProfile;
  selected: boolean;
  onSelect: (id: string) => void;
}

function AgentCard({ agent, selected, onSelect }: AgentCardProps) {
  const roleKey = (agent.role || '').toLowerCase().split(' ')[0];
  const roleColor = ROLE_COLORS[roleKey] || 'text-zinc-300';
  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-center cursor-pointer ${
        selected
          ? 'border-[var(--accent-border)] bg-[var(--accent-dim)]'
          : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${selected ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'bg-[var(--surface-3)] text-[var(--text-3)]'}`}>
        {(agent.name || agent.id || '?').charAt(0).toUpperCase()}
      </div>
      <p className="text-xs font-medium text-[var(--text-2)] leading-tight">{agent.name || agent.id}</p>
      <p className={`text-[10px] ${roleColor} leading-tight`}>{agent.role || 'Agent'}</p>
      {selected && (
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] bg-[var(--accent-dim)] px-1.5 py-0.5 rounded-full border border-[var(--accent-border)]">
          Selected
        </span>
      )}
    </button>
  );
}

export function AgentPairingView() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [pairs, setPairs] = useState<AgentPair[]>([]);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [form, setForm] = useState<PairForm>({ triggerOn: '', note: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const profiles = listAgentProfiles();
    setAgents(profiles);
    setPairs(readPairs());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleSelectAgent(id: string) {
    if (!selectedA || (selectedA && selectedB)) {
      setSelectedA(id);
      setSelectedB(null);
      setError('');
    } else if (selectedA === id) {
      setSelectedA(null);
    } else {
      setSelectedB(id);
    }
  }

  function handleAddPair(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!selectedA || !selectedB) {
      setError('Select two agents to pair.');
      return;
    }
    if (selectedA === selectedB) {
      setError('Cannot pair an agent with itself.');
      return;
    }
    if (!form.triggerOn.trim()) {
      setError('Trigger condition is required.');
      return;
    }
    const duplicate = pairs.find(
      (p) =>
        (p.agentA === selectedA && p.agentB === selectedB) ||
        (p.agentA === selectedB && p.agentB === selectedA)
    );
    if (duplicate) {
      setError('A pairing between these two agents already exists.');
      return;
    }
    const pair: AgentPair = {
      id: `pair-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      agentA: selectedA,
      agentB: selectedB,
      triggerOn: form.triggerOn.trim(),
      note: form.note.trim(),
      createdAt: Date.now(),
    };
    const next = [...pairs, pair];
    writePairs(next);
    setPairs(next);
    setSelectedA(null);
    setSelectedB(null);
    setForm({ triggerOn: '', note: '' });
  }

  function handleDeletePair(id: string) {
    const next = pairs.filter((p) => p.id !== id);
    writePairs(next);
    setPairs(next);
  }

  function getAgentName(id: string) {
    const a = agents.find((ag) => ag.id === id);
    return a ? (a.name || a.id) : id;
  }

  const selectionStep = !selectedA ? 1 : !selectedB ? 2 : 3;

  return (
    <div className="flex flex-col gap-5 p-4 h-full">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-base font-semibold text-[var(--text-1)]">Agent Pairing</h2>
        <span className="text-xs text-[var(--text-3)]">({pairs.length} pair{pairs.length !== 1 ? 's' : ''})</span>
      </div>

      <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">
          {selectionStep === 1 && 'Step 1 — Select Agent A'}
          {selectionStep === 2 && `Step 2 — Select Agent B (pairing with ${getAgentName(selectedA!)})`}
          {selectionStep === 3 && `Step 3 — Define trigger for ${getAgentName(selectedA!)} ↔ ${getAgentName(selectedB!)}`}
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={agent.id === selectedA || agent.id === selectedB}
              onSelect={handleSelectAgent}
            />
          ))}
        </div>

        {selectionStep === 3 && (
          <form onSubmit={handleAddPair} className="space-y-2 pt-2 border-t border-[var(--border)]">
            {error && <p className="text-xs text-[var(--error)]">{error}</p>}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Trigger condition (e.g. 'on_task_complete', 'risk_score > 80')"
                value={form.triggerOn}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, triggerOn: e.target.value }))}
                className="flex-1 min-w-48 px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-2)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-strong)]"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Note (optional)"
                value={form.note}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-2)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-strong)]"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--accent-dim)] border border-[var(--accent-border)] text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Pair
              </button>
              <button
                type="button"
                onClick={() => { setSelectedA(null); setSelectedB(null); setError(''); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-3)] hover:bg-[var(--surface-3)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && selectionStep !== 3 && (
          <p className="text-xs text-[var(--error)]">{error}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">
          Existing Pairs
        </p>
        {pairs.length === 0 ? (
          <p className="text-xs text-[var(--text-3)] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-4 text-center">
            No agent pairs defined yet. Select two agents above to create a collaboration rule.
          </p>
        ) : (
          pairs.map((pair) => (
            <div
              key={pair.id}
              className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-[var(--accent)]">{getAgentName(pair.agentA)}</span>
                  <Link2 className="w-3 h-3 text-[var(--text-3)]" />
                  <span className="text-xs font-medium text-[var(--accent)]">{getAgentName(pair.agentB)}</span>
                </div>
                <p className="text-[11px] text-[var(--text-3)]">
                  Trigger: <span className="text-[var(--text-2)] font-mono">{pair.triggerOn}</span>
                </p>
                {pair.note && (
                  <p className="text-[11px] text-[var(--text-3)]">{pair.note}</p>
                )}
                <p className="text-[10px] text-[var(--text-4)]">
                  Created {new Date(pair.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDeletePair(pair.id)}
                className="shrink-0 p-1.5 rounded-lg text-[var(--text-4)] hover:text-[var(--error)] hover:bg-[var(--error-dim)] transition-colors"
                aria-label="Delete pair"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AgentPairingView;
