import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Link2, User } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';

const PAIRS_KEY = 'alphonso_agent_pairs_v1';

function readPairs() {
  try {
    const raw = localStorage.getItem(PAIRS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePairs(list) {
  localStorage.setItem(PAIRS_KEY, JSON.stringify(list));
}

const ROLE_COLORS = {
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

function AgentCard({ agent, selected, onSelect }) {
  const roleKey = (agent.role || '').toLowerCase().split(' ')[0];
  const roleColor = ROLE_COLORS[roleKey] || 'text-zinc-300';
  return (
    <button
      onClick={() => onSelect(agent.id)}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-center cursor-pointer ${
        selected
          ? 'border-violet-500/40 bg-violet-500/10'
          : 'border-white/[0.06] bg-zinc-900/40 hover:border-white/[0.12] hover:bg-zinc-900/60'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${selected ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-400'}`}>
        {(agent.name || agent.id || '?').charAt(0).toUpperCase()}
      </div>
      <p className="text-xs font-medium text-zinc-200 leading-tight">{agent.name || agent.id}</p>
      <p className={`text-[10px] ${roleColor} leading-tight`}>{agent.role || 'Agent'}</p>
      {selected && (
        <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full border border-violet-500/20">
          Selected
        </span>
      )}
    </button>
  );
}

export function AgentPairingView() {
  const [agents, setAgents] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [selectedA, setSelectedA] = useState(null);
  const [selectedB, setSelectedB] = useState(null);
  const [form, setForm] = useState({ triggerOn: '', note: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const profiles = listAgentProfiles();
    setAgents(profiles);
    setPairs(readPairs());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleSelectAgent(id) {
    if (!selectedA || (selectedA && selectedB)) {
      // Start new selection
      setSelectedA(id);
      setSelectedB(null);
      setError('');
    } else if (selectedA === id) {
      setSelectedA(null);
    } else {
      setSelectedB(id);
    }
  }

  function handleAddPair(e) {
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
    const pair = {
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

  function handleDeletePair(id) {
    const next = pairs.filter((p) => p.id !== id);
    writePairs(next);
    setPairs(next);
  }

  function getAgentName(id) {
    const a = agents.find((ag) => ag.id === id);
    return a ? (a.name || a.id) : id;
  }

  const selectionStep = !selectedA ? 1 : !selectedB ? 2 : 3;

  return (
    <div className="flex flex-col gap-5 p-4 h-full">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-violet-400" />
        <h2 className="text-base font-semibold text-zinc-100">Agent Pairing</h2>
        <span className="text-xs text-zinc-500">({pairs.length} pair{pairs.length !== 1 ? 's' : ''})</span>
      </div>

      <div className="rounded-xl bg-zinc-900/40 border border-white/[0.05] p-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {selectionStep === 1 && 'Step 1 — Select Agent A'}
          {selectionStep === 2 && `Step 2 — Select Agent B (pairing with ${getAgentName(selectedA)})`}
          {selectionStep === 3 && `Step 3 — Define trigger for ${getAgentName(selectedA)} ↔ ${getAgentName(selectedB)}`}
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
          <form onSubmit={handleAddPair} className="space-y-2 pt-2 border-t border-white/[0.05]">
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Trigger condition (e.g. 'on_task_complete', 'risk_score > 80')"
                value={form.triggerOn}
                onChange={(e) => setForm((f) => ({ ...f, triggerOn: e.target.value }))}
                className="flex-1 min-w-48 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Note (optional)"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-600/20 border border-violet-500/20 text-violet-400 hover:bg-violet-600/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Pair
              </button>
              <button
                type="button"
                onClick={() => { setSelectedA(null); setSelectedB(null); setError(''); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && selectionStep !== 3 && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Existing Pairs
        </p>
        {pairs.length === 0 ? (
          <p className="text-xs text-zinc-500 rounded-xl bg-zinc-900/40 border border-white/[0.05] px-4 py-4 text-center">
            No agent pairs defined yet. Select two agents above to create a collaboration rule.
          </p>
        ) : (
          pairs.map((pair) => (
            <div
              key={pair.id}
              className="flex items-start gap-3 rounded-xl bg-zinc-900/40 border border-white/[0.05] px-4 py-3"
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-violet-300">{getAgentName(pair.agentA)}</span>
                  <Link2 className="w-3 h-3 text-zinc-500" />
                  <span className="text-xs font-medium text-violet-300">{getAgentName(pair.agentB)}</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Trigger: <span className="text-zinc-300 font-mono">{pair.triggerOn}</span>
                </p>
                {pair.note && (
                  <p className="text-[11px] text-zinc-500">{pair.note}</p>
                )}
                <p className="text-[10px] text-zinc-600">
                  Created {new Date(pair.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDeletePair(pair.id)}
                className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
