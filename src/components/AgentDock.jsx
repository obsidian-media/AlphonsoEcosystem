import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, GripHorizontal, Minus } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import { AgentAvatar } from './AgentAvatar';

const STORAGE_KEY = 'alphonso_agent_dock_minimized_v1';
const POSITION_STORAGE_KEY = 'alphonso_agent_dock_position_v1';

const DEFAULT_POSITION = { x: 16, y: 16 };

function readStoredPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) || 'null');
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch {
    // Ignore corrupted storage and fall back to safe top-left default.
  }
  return DEFAULT_POSITION;
}

function clampPosition(position) {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(8, window.innerWidth - 96);
  const maxY = Math.max(8, window.innerHeight - 56);
  return {
    x: Math.min(Math.max(8, position.x), maxX),
    y: Math.min(Math.max(8, position.y), maxY)
  };
}

function useOllamaStatus() {
  const [online, setOnline] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  return online;
}

export function AgentDock({ companions }) {
  const [minimized, setMinimized] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });
  const [position, setPosition] = useState(() => clampPosition(readStoredPosition()));
  const dragRef = useRef(null);
  const registryAgents = listAgentProfiles();
  const activeIds = new Set(companions.map((item) => item.agentId));
  const otherAgents = registryAgents.filter((agent) => !activeIds.has(agent.id));
  const summary = companions.map((item) => item.name).join(' · ');
  const ollamaOnline = useOllamaStatus();

  useEffect(() => {
    const onResize = () => setPosition((current) => {
      const next = clampPosition(current);
      try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function toggle() {
    setMinimized((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { return next; }
      return next;
    });
  }

  function startDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    };
  }

  useEffect(() => {
    function onPointerMove(event) {
      if (!dragRef.current) return;
      const next = clampPosition({
        x: dragRef.current.originX + event.clientX - dragRef.current.startX,
        y: dragRef.current.originY + event.clientY - dragRef.current.startY
      });
      setPosition(next);
    }
    function onPointerUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setPosition((current) => {
        const next = clampPosition(current);
        try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
        return next;
      });
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <div
      className={`pointer-events-auto fixed z-50 rounded-xl border border-white/10 bg-zinc-950/95 shadow-xl backdrop-blur-xl overflow-hidden ${minimized ? 'w-[12.5rem]' : 'w-[17.5rem]'}`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {/* Header — always visible */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onPointerDown={startDrag}
          title="Move agent dock"
          className="cursor-grab rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 active:cursor-grabbing"
        >
          <GripHorizontal className="h-3 w-3" />
        </button>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100 flex-1 cursor-grab select-none active:cursor-grabbing"
          onPointerDown={startDrag}
          title="Drag to move agent dock"
        >Agent Dock</div>

        {/* Ollama connectivity pill */}
        <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider border ${
          ollamaOnline === null
            ? 'border-zinc-700 bg-zinc-900/60 text-zinc-500'
            : ollamaOnline
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/30 bg-red-500/10 text-red-400'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            ollamaOnline === null ? 'bg-zinc-600' : ollamaOnline ? 'bg-emerald-400' : 'bg-red-400'
          }`} />
          {ollamaOnline === null ? 'checking' : ollamaOnline ? 'Ollama' : 'offline'}
        </div>

        {/* Minimize / expand button */}
        <button
          onClick={toggle}
          title={minimized ? 'Expand agent dock' : 'Minimize agent dock'}
          className="p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          {minimized ? <ChevronDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        </button>
      </div>

      {/* Body — hidden when minimized */}
      {!minimized && (
        <div className="space-y-2 p-2.5">
          {/* Active companions summary row */}
          <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-white/8 bg-zinc-900/60 px-2.5 py-2">
            <div className="flex -space-x-2 shrink-0">
              {companions.map((item) => (
                <div key={item.agentId} className="rounded-full border border-zinc-950 bg-zinc-950 p-0.5 shadow-md">
                  <AgentAvatar agentId={item.agentId} name={item.name} sizeClass="h-6 w-6" />
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-200 truncate">{summary}</div>
              <div className="text-[8px] text-zinc-400 truncate">Active companions</div>
            </div>
          </div>

          {/* Per-agent state grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {companions.map((item) => (
              <div key={item.agentId} className="rounded-lg border border-white/8 bg-zinc-900/45 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <div className="shrink-0">
                    <AgentAvatar agentId={item.agentId} name={item.name} sizeClass="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-200 truncate">{item.name}</div>
                    <div className="text-[8px] text-zinc-500 truncate">{item.state}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Other (inactive) agents */}
          {otherAgents.length > 0 && (
            <div className="rounded-lg border border-white/8 bg-zinc-900/35 p-2">
              <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-500">Other agents</div>
              <div className="flex flex-wrap gap-1">
                {otherAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-1 rounded-full border border-white/8 bg-zinc-950/60 px-1.5 py-1">
                    <AgentAvatar agentId={agent.id} name={agent.name} sizeClass="h-4 w-4" />
                    <span className="max-w-[4.5rem] truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{agent.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
