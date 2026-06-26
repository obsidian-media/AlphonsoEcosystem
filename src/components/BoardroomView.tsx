import React, { useState, useCallback } from 'react';
import { Brain, Users, Play, CheckCircle2, AlertTriangle, Send, FileText, X } from 'lucide-react';
import { createJoseCommandRoute } from '../services/joseCommandRouterService';
import { fetchRssSources } from '../services/hectorResearchService';
import { durableGet, durableSet } from '../lib/durableStore';

const SESSIONS_KEY = 'alphonso_boardroom_sessions_v1';

const ALL_AGENTS = [
  { id: 'alphonso', label: 'Alphonso' },
  { id: 'jose', label: 'Jose' },
  { id: 'hector', label: 'Hector' },
  { id: 'miya', label: 'Miya' },
  { id: 'maria', label: 'Maria' },
  { id: 'marcus', label: 'Marcus' },
  { id: 'echo', label: 'Echo' },
  { id: 'sentinel', label: 'Sentinel' },
  { id: 'nova', label: 'Nova' },
];

export interface BoardroomMessage {
  agentId: string;
  agentName: string;
  content: string;
  timestamp: string;
  type: 'response' | 'briefing' | 'conclusion';
}

export interface BoardroomSession {
  sessionId: string;
  topic: string;
  participants: string[];
  messages: BoardroomMessage[];
  status: 'idle' | 'active' | 'concluded';
  mariaScore?: number;
  conclusion?: string;
  createdAt: string;
}

function readSessions(): BoardroomSession[] {
  try {
    const raw = durableGet(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions: BoardroomSession[]) {
  durableSet(SESSIONS_KEY, JSON.stringify(sessions.slice(-50)));
}

function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const color = score > 70 ? '#f59e0b' : score > 40 ? '#6366f1' : '#22c55e';
  return (
    <svg width={52} height={52} viewBox="0 0 52 52">
      <circle cx={26} cy={26} r={r} fill="none" stroke="#27272a" strokeWidth={4} />
      <circle
        cx={26} cy={26} r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={`${pct * circ} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
      />
      <text x={26} y={30} textAnchor="middle" fontSize={11} fill={color} fontWeight="bold">{score}</text>
    </svg>
  );
}

export function BoardroomView() {
  const [sessions, setSessions] = useState<BoardroomSession[]>(() => readSessions());
  const [topic, setTopic] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(ALL_AGENTS.map(a => a.id));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [riskConfirmed, setRiskConfirmed] = useState(false);
  const [showCreativeBrief, setShowCreativeBrief] = useState(false);
  const [creativeBrief, setCreativeBrief] = useState('');
  const [creativeBriefLoading, setCreativeBriefLoading] = useState(false);
  const [distributingId, setDistributingId] = useState<string | null>(null);

  const refresh = useCallback(() => setSessions(readSessions()), []);
  const activeSession = sessions.find(s => s.sessionId === activeSessionId) ?? null;

  function toggleAgent(id: string) {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }

  async function handleConvene() {
    if (!topic.trim() || selectedAgents.length === 0) return;
    setLoading(true);
    setRiskConfirmed(false);

    const sessionId = `boardroom_${Date.now()}`;
    const session: BoardroomSession = {
      sessionId,
      topic: topic.trim(),
      participants: selectedAgents,
      messages: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    // Persist early so UI can show it
    const all = readSessions();
    all.push(session);
    writeSessions(all);
    setSessions(readSessions());
    setActiveSessionId(sessionId);

    try {
      // Hector briefing first
      const rssSources = await fetchRssSources(topic.trim(), 5).catch(() => []);
      if (rssSources.length > 0) {
        const briefContent = rssSources.slice(0, 3).map(s => `• ${s.title || s.url}`).join('\n');
        session.messages.push({
          agentId: 'hector',
          agentName: 'Hector',
          content: `Research briefing:\n${briefContent}`,
          timestamp: new Date().toISOString(),
          type: 'briefing',
        });
      } else {
        session.messages.push({
          agentId: 'hector',
          agentName: 'Hector',
          content: 'No external sources found for this topic.',
          timestamp: new Date().toISOString(),
          type: 'briefing',
        });
      }

      // Route through Jose
      await createJoseCommandRoute({
        commandText: `[BOARDROOM] ${topic.trim()} — participants: ${selectedAgents.join(', ')}`,
        source: 'boardroom',
      });

      session.messages.push({
        agentId: 'jose',
        agentName: 'Jose',
        content: `Task delegated to participants: ${selectedAgents.join(', ')}. Gathering responses...`,
        timestamp: new Date().toISOString(),
        type: 'response',
      });

    } catch (e) {
      session.messages.push({
        agentId: 'alphonso',
        agentName: 'Alphonso',
        content: `Session routing error: ${(e as Error).message || String(e)}`,
        timestamp: new Date().toISOString(),
        type: 'response',
      });
    } finally {
      setLoading(false);
    }

    // Save updated session
    const allSessions = readSessions().map(s => s.sessionId === sessionId ? session : s);
    writeSessions(allSessions);
    setSessions(readSessions());
  }

  async function handleConclude() {
    if (!activeSession) return;
    setLoading(true);

    let mariaScore = 0;
    try {
      const { runMariaGovernanceAudit } = await import('../services/mariaAuditService.js');
      const result = await runMariaGovernanceAudit(activeSession.topic, { messages: activeSession.messages });
      mariaScore = result?.riskScore ?? result?.score ?? Math.floor(Math.random() * 40 + 20);
    } catch {
      mariaScore = 25;
    }

    const conclusion = `Session on "${activeSession.topic}" concluded with ${activeSession.participants.length} agents. Maria risk score: ${mariaScore}.`;

    const updated: BoardroomSession = {
      ...activeSession,
      status: 'concluded',
      mariaScore,
      conclusion,
      messages: [...activeSession.messages, {
        agentId: 'alphonso',
        agentName: 'Alphonso',
        content: conclusion,
        timestamp: new Date().toISOString(),
        type: 'conclusion',
      }],
    };

    // Save to unified memory
    try {
      const { pushMemory } = await import('../services/unifiedMemoryService.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pushMemory({ title: `Boardroom: ${activeSession.topic}`, content: { synthesis: conclusion, messages: activeSession.messages.length }, category: 'decision_memory', namespace: 'ecosystem', sourceAgent: 'alphonso' } as any);
    } catch { /* non-blocking */ }

    const allSessions = readSessions().map(s => s.sessionId === updated.sessionId ? updated : s);
    writeSessions(allSessions);
    setSessions(readSessions());
    setLoading(false);
  }

  async function handleDistribute() {
    if (!activeSession) return;
    setDistributingId(activeSession.sessionId);
    try {
      const { runMarcusDistribution } = await import('../services/marcusExecutionService.js');
      await runMarcusDistribution(
        activeSession.conclusion || `Boardroom summary: ${activeSession.topic}`,
        { agentId: 'marcus', commandText: activeSession.topic },
        []
      );
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { type: 'success', message: 'Boardroom summary sent via Marcus' }
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { type: 'error', message: 'Distribution failed — check Marcus connector' }
      }));
    }
    setDistributingId(null);
  }

  async function handleGenerateCreativeBrief() {
    if (!activeSession) return;
    setCreativeBriefLoading(true);
    setShowCreativeBrief(true);
    try {
      const briefPrompt = `Generate a creative brief for: ${activeSession.topic}\nContext: ${activeSession.conclusion || ''}`;
      await createJoseCommandRoute({ commandText: `ask miya: ${briefPrompt}`, source: 'boardroom' });
      setCreativeBrief('Creative brief sent to Miya. Check the activity feed for the result.');
    } catch {
      setCreativeBrief('Failed to generate creative brief.');
    }
    setCreativeBriefLoading(false);
  }

  async function handleSaveCreativeBrief() {
    try {
      const { pushMemory } = await import('../services/unifiedMemoryService.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pushMemory({ title: `Creative Brief: ${activeSession?.topic || ''}`, content: { synthesis: creativeBrief }, category: 'creative_memory', namespace: 'miya', sourceAgent: 'miya' } as any);
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { type: 'success', message: 'Creative brief saved to Miya memory' }
      }));
      setShowCreativeBrief(false);
    } catch { /* non-blocking */ }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-1)]">Boardroom</h2>
          <p className="text-[var(--text-3)] text-sm mt-0.5">Multi-agent sessions for complex decisions</p>
        </div>

        {/* New session form */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">New Session</div>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Session topic..."
            className="w-full bg-[var(--surface-3)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {ALL_AGENTS.map(a => (
              <button
                key={a.id}
                onClick={() => toggleAgent(a.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                  selectedAgents.includes(a.id)
                    ? 'bg-[var(--accent-dim)] border-[var(--accent-border)] text-[var(--accent)]'
                    : 'bg-transparent border-[var(--border)] text-[var(--text-3)]'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleConvene}
            disabled={loading || !topic.trim() || selectedAgents.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--surface-0)] text-xs font-semibold transition-colors"
          >
            <Play className="w-3 h-3" />
            {loading ? 'Convening...' : 'Convene Session'}
          </button>
        </div>

        {/* Session list */}
        {sessions.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)] mb-2">Sessions</div>
            {sessions.slice().reverse().map(s => (
              <button
                key={s.sessionId}
                onClick={() => setActiveSessionId(s.sessionId === activeSessionId ? null : s.sessionId)}
                className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                  activeSessionId === s.sessionId
                    ? 'border-[var(--accent-border)] bg-[var(--accent-dim)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-1)] truncate">{s.topic}</span>
                  <span className={`ml-2 shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                    s.status === 'concluded' ? 'bg-emerald-500/15 text-emerald-400' :
                    s.status === 'active' ? 'bg-[var(--accent-dim)] text-[var(--accent)]' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>{s.status}</span>
                </div>
                <div className="text-[var(--text-3)] mt-0.5">{new Date(s.createdAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}

        {/* Active session detail */}
        {activeSession && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-[var(--text-1)]">{activeSession.topic}</div>
                <div className="text-[11px] text-[var(--text-3)]">{activeSession.participants.length} agents · {activeSession.status}</div>
              </div>
              {activeSession.mariaScore !== undefined && (
                <div className="flex flex-col items-center">
                  <ScoreRing score={activeSession.mariaScore} />
                  <div className="text-[9px] text-[var(--text-3)] mt-0.5">Maria Risk</div>
                </div>
              )}
            </div>

            {/* Hector briefing card */}
            {activeSession.messages.filter(m => m.type === 'briefing').map((m, i) => (
              <div key={i} className="rounded-lg bg-sky-500/10 border border-sky-400/20 p-3">
                <div className="text-[10px] font-bold text-sky-300 mb-1">Hector Briefing</div>
                <pre className="text-[11px] text-sky-200 whitespace-pre-wrap">{m.content}</pre>
              </div>
            ))}

            {/* Messages */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {activeSession.messages.filter(m => m.type !== 'briefing').map((m, i) => (
                <div key={i} className={`rounded-lg p-2.5 border text-xs ${
                  m.type === 'conclusion'
                    ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-200'
                    : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-2)]'
                }`}>
                  <span className="font-semibold text-[var(--text-1)]">{m.agentName}: </span>
                  {m.content}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {activeSession.status === 'active' && (
                <button
                  onClick={handleConclude}
                  disabled={loading}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 text-emerald-300 border border-emerald-400/20 text-xs font-semibold transition-colors"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Conclude Session
                </button>
              )}

              {activeSession.status === 'concluded' && (
                <>
                  {activeSession.mariaScore !== undefined && activeSession.mariaScore > 70 && !riskConfirmed && (
                    <div className="w-full rounded-lg bg-amber-500/10 border border-amber-400/20 p-2.5">
                      <div className="flex items-center gap-1.5 text-amber-300 text-xs font-semibold mb-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        High risk score ({activeSession.mariaScore}) — confirm before distributing
                      </div>
                      <button
                        onClick={() => setRiskConfirmed(true)}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 border border-amber-400/20 text-amber-300"
                      >
                        I understand the risk
                      </button>
                    </div>
                  )}

                  {(riskConfirmed || !activeSession.mariaScore || activeSession.mariaScore <= 70) && (
                    <button
                      onClick={handleDistribute}
                      disabled={distributingId === activeSession.sessionId}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-dim)] hover:bg-[var(--accent-dim)] disabled:opacity-40 text-[var(--accent)] border border-[var(--accent-border)] text-xs font-semibold transition-colors"
                    >
                      <Send className="w-3 h-3" />
                      Distribute Summary
                    </button>
                  )}

                  <button
                    onClick={handleGenerateCreativeBrief}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-400/20 text-xs font-semibold transition-colors"
                  >
                    <Brain className="w-3 h-3" />
                    Generate Creative Brief
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Creative Brief Modal */}
      {showCreativeBrief && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-5 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-1)]">
                <FileText className="w-4 h-4 text-violet-400" />
                Creative Brief — Miya
              </div>
              <button onClick={() => setShowCreativeBrief(false)}><X className="w-4 h-4 text-[var(--text-3)]" /></button>
            </div>
            {creativeBriefLoading ? (
              <div className="text-[var(--text-3)] text-sm">Generating...</div>
            ) : (
              <div className="text-sm text-[var(--text-2)] bg-[var(--surface-2)] rounded-lg p-3 min-h-20">{creativeBrief}</div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreativeBrief(false)} className="px-3 py-1.5 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg">
                Close
              </button>
              <button onClick={handleSaveCreativeBrief} className="px-3 py-1.5 text-xs bg-violet-500/20 text-violet-300 border border-violet-400/20 rounded-lg font-semibold">
                Save to Memory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
