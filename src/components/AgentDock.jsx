import React, { useEffect, useRef, useState } from 'react';
import { GripHorizontal, Minus, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { listAgentProfiles } from '../agents/agentRegistry';
import { AgentAvatar } from './AgentAvatar';

const STORAGE_KEY = 'alphonso_agent_dock_minimized_v1';
const POSITION_STORAGE_KEY = 'alphonso_agent_dock_position_v1';
const DEFAULT_POSITION = { x: 16, y: 16 };

function readStoredPosition() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) || 'null');
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch { /* ignore */ }
  return DEFAULT_POSITION;
}

function clampPosition(position) {
  if (typeof window === 'undefined') return position;
  return {
    x: Math.min(Math.max(8, position.x), Math.max(8, window.innerWidth - 96)),
    y: Math.min(Math.max(8, position.y), Math.max(8, window.innerHeight - 56))
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

// Map raw agent states to calm display labels
function friendlyState(state) {
  const s = String(state || '').toLowerCase();
  if (!s || s === 'idle' || s === 'offline' || s === 'ready') return 'Ready';
  if (s === 'active' || s === 'working' || s === 'thinking' || s === 'running') return 'Active';
  if (s === 'listening') return 'Listening';
  if (s === 'rendering' || s === 'creating') return 'Creating';
  if (s === 'researching') return 'Researching';
  if (s === 'directing' || s === 'routing') return 'Routing';
  if (s === 'warning') return 'Needs attention';
  if (s === 'error' || s === 'failed') return 'Error';
  if (s === 'approval') return 'Waiting';
  return 'Ready';
}

function isAgentActive(state) {
  const s = String(state || '').toLowerCase();
  return ['active', 'working', 'thinking', 'running', 'listening', 'rendering', 'creating', 'researching', 'directing', 'routing'].includes(s);
}

export function AgentDock({ companions }) {
  const [minimized, setMinimized] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch { return true; }
  });
  const [position, setPosition] = useState(() => clampPosition(readStoredPosition()));
  const dragRef = useRef(null);
  const registryAgents = listAgentProfiles();
  const activeIds = new Set(companions.map((item) => item.agentId));
  const otherAgents = registryAgents.filter((agent) => !activeIds.has(agent.id));
  const ollamaOnline = useOllamaStatus();
  const busyCount = companions.filter((c) => isAgentActive(c.state)).length;

  useEffect(() => {
    const onResize = () => setPosition((curr) => {
      const next = clampPosition(curr);
      try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function toggle() {
    setMinimized((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* no-op */ }
      return next;
    });
  }

  function startDrag(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
  }

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return;
      setPosition(clampPosition({
        x: dragRef.current.originX + e.clientX - dragRef.current.startX,
        y: dragRef.current.originY + e.clientY - dragRef.current.startY,
      }));
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setPosition((curr) => {
        const next = clampPosition(curr);
        try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
        return next;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, []);

  return (
    <div
      className="pointer-events-auto fixed z-50 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/90 shadow-2xl backdrop-blur-xl"
      style={{ left: `${position.x}px`, top: `${position.y}px`, width: minimized ? '11rem' : '16rem' }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <button
          type="button"
          onPointerDown={startDrag}
          className="cursor-grab rounded p-0.5 text-zinc-600 hover:text-zinc-400 active:cursor-grabbing"
        >
          <GripHorizontal className="h-3 w-3" />
        </button>

        <div
          className="flex-1 cursor-grab select-none text-[10px] font-semibold tracking-widest text-zinc-400 uppercase"
          onPointerDown={startDrag}
        >
          Agents
        </div>

        {/* Ollama status — compact */}
        <div className="flex items-center gap-1">
          {ollamaOnline === null ? (
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />
          ) : ollamaOnline ? (
            <Wifi className="h-3 w-3 text-emerald-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-zinc-600" />
          )}
        </div>

        <button onClick={toggle} className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors">
          {minimized ? <ChevronDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </button>
      </div>

      {/* Minimized: just avatar strip */}
      {minimized && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            {companions.slice(0, 4).map((item) => (
              <div key={item.agentId} className="relative">
                <AgentAvatar agentId={item.agentId} name={item.name} sizeClass="h-6 w-6" />
                {isAgentActive(item.state) && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-950" />
                )}
              </div>
            ))}
            {companions.length > 4 && (
              <span className="text-[10px] text-zinc-600">+{companions.length - 4}</span>
            )}
          </div>
          {busyCount > 0 && (
            <div className="mt-1.5 text-[10px] text-emerald-400">{busyCount} active</div>
          )}
          {!ollamaOnline && ollamaOnline !== null && (
            <div className="mt-1 text-[10px] text-zinc-600">Local AI offline</div>
          )}
        </div>
      )}

      {/* Expanded */}
      {!minimized && (
        <div className="px-3 pb-3 space-y-2">
          {/* Active companions */}
          {companions.map((item) => {
            const active = isAgentActive(item.state);
            return (
              <div key={item.agentId} className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <AgentAvatar agentId={item.agentId} name={item.name} sizeClass="h-7 w-7" />
                  {active && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-950" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-zinc-200 truncate">{item.name}</div>
                  <div className={`text-[10px] truncate ${active ? 'text-emerald-400' : 'text-zinc-600'}`}>
                    {friendlyState(item.state)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Divider + other agents (compact) */}
          {otherAgents.length > 0 && (
            <>
              <div className="border-t border-white/[0.06]" />
              <div className="flex flex-wrap gap-1.5">
                {otherAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-1">
                    <AgentAvatar agentId={agent.id} name={agent.name} sizeClass="h-5 w-5" />
                    <span className="text-[10px] text-zinc-600 truncate max-w-[4rem]">{agent.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Ollama state — only show if relevant */}
          {ollamaOnline === false && (
            <div className="rounded-lg bg-zinc-900/60 px-2.5 py-2 text-[10px] text-zinc-500">
              Local AI is offline — start Ollama to enable agent reasoning.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
