import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clipboard, ClipboardList, Crown, Clapperboard, ExternalLink, Hammer, LockKeyhole, MessageSquare, Palette, PenTool, Plus, RadioTower, Send, Server, Shield, Sparkles, User, Zap } from 'lucide-react';
import {
  MISSION_ROOM_AGENTS,
  MISSION_ROOM_SECURITY_MODEL,
  MISSION_TASK_STATUSES,
  addMissionMessage,
  addMissionTask,
  clearMissionMessages,
  createHermesHandoff,
  getMissionRoom,
  listMissionMessages,
  listMissionSecurityEvents,
  listMissionTasks,
  updateMissionTask,
  type SecurityEvent,
  type MissionTaskStatus
} from '../services/missionRoomService';

function cx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function agentTone(accent: string) {
  // Real bug fix (was: only emerald/amber/fuchsia/sky handled, everything
  // else — cyan/violet/pink/orange/blue/red, i.e. Alphonso/Hector/Miya/
  // Marcus/Echo/Sentinel — silently fell through to the cyan default,
  // making 6 of 11 agents render visually identical). Every real accent
  // value MISSION_ROOM_AGENTS defines now gets its own distinct tone.
  if (accent === 'emerald') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100 shadow-[0_0_36px_rgba(16,185,129,0.08)]';
  if (accent === 'amber') return 'border-amber-300/20 bg-amber-500/10 text-amber-100 shadow-[0_0_36px_rgba(245,158,11,0.08)]';
  if (accent === 'fuchsia') return 'border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_36px_rgba(217,70,239,0.08)]';
  if (accent === 'sky') return 'border-sky-300/20 bg-sky-500/10 text-sky-100 shadow-[0_0_36px_rgba(14,165,233,0.08)]';
  if (accent === 'violet') return 'border-violet-300/20 bg-violet-500/10 text-violet-100 shadow-[0_0_36px_rgba(139,92,246,0.08)]';
  if (accent === 'pink') return 'border-pink-300/20 bg-pink-500/10 text-pink-100 shadow-[0_0_36px_rgba(236,72,153,0.08)]';
  if (accent === 'orange') return 'border-orange-300/20 bg-orange-500/10 text-orange-100 shadow-[0_0_36px_rgba(249,115,22,0.08)]';
  if (accent === 'blue') return 'border-blue-300/20 bg-blue-500/10 text-blue-100 shadow-[0_0_36px_rgba(59,130,246,0.08)]';
  if (accent === 'red') return 'border-red-300/20 bg-red-500/10 text-red-100 shadow-[0_0_36px_rgba(239,68,68,0.08)]';
  return 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100 shadow-[0_0_36px_rgba(34,211,238,0.08)]';
}

function statusTone(status: string) {
  if (status === 'approved') return 'border-[var(--success)]/30 bg-[var(--success-dim)] text-[var(--success)]';
  if (status === 'review') return 'border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]';
  if (status === 'doing') return 'border-[var(--warning)]/30 bg-[var(--warning-dim)] text-[var(--warning)]';
  if (status === 'blocked') return 'border-[var(--error)]/30 bg-[var(--error-dim)] text-[var(--error)]';
  return 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)]';
}

function riskTone(riskLevel: string) {
  if (riskLevel === 'high') return 'border-[var(--error)]/40 bg-[var(--error-dim)] text-[var(--error)]';
  if (riskLevel === 'medium') return 'border-[var(--warning)]/40 bg-[var(--warning-dim)] text-[var(--warning)]';
  return 'border-[var(--success)]/30 bg-[var(--success-dim)] text-[var(--success)]';
}

function speakerIcon(speaker: string) {
  if (speaker === 'user') return User;
  if (speaker === 'alphonso') return Bot;
  if (speaker === 'jose') return Crown;
  if (speaker === 'hector') return ClipboardList;
  if (speaker === 'miya') return Clapperboard;
  if (speaker === 'maria') return Shield;
  if (speaker === 'marcus') return Send;
  if (speaker === 'echo') return RadioTower;
  if (speaker === 'sentinel') return LockKeyhole;
  if (speaker === 'nova') return Palette;
  if (speaker === 'kairo') return Server;
  return Bot;
}

const lookupAgent = (key: string) => MISSION_ROOM_AGENTS[key] || MISSION_ROOM_AGENTS.alphonso || MISSION_ROOM_AGENTS.jose || Object.values(MISSION_ROOM_AGENTS)[0] || { key: 'unknown', name: 'Unknown', role: 'unknown', lane: '', accent: 'zinc' };

interface AgentCardProps {
  agentKey: string;
  reservedSlot?: string;
}

function AgentCard({ agentKey, reservedSlot }: AgentCardProps) {
  if (reservedSlot) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 bg-[var(--surface-1)] p-4 text-[var(--text-3)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black text-[var(--text-2)]">Empty slot</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-65">reserved later</div>
          </div>
        </div>
        <div className="mt-3 text-xs leading-relaxed opacity-75">Kept intentionally blank until Shayan approves another participant lane.</div>
      </div>
    );
  }
  const agent = lookupAgent(agentKey);
  const Icon = speakerIcon(agentKey);
  return (
    <div className={cx('rounded-3xl border p-4', agentTone(agent.accent))}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-black text-white">{agent.name}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-65">{agent.lane}</div>
        </div>
      </div>
      <div className="mt-3 text-xs leading-relaxed opacity-75">{agent.role}</div>
      <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Ready lane
      </div>
    </div>
  );
}

interface Message {
  id: string;
  speaker: string;
  content: string;
  riskLevel?: string;
  approvalRequired?: boolean;
  metadata?: { secretRedacted?: boolean };
  createdAt?: string;
}

function MessageBubble({ message }: { message: Message }) {
  const agent = lookupAgent(message.speaker);
  const Icon = speakerIcon(message.speaker);
  return (
    <div className={cx('rounded-3xl border p-4', agentTone(agent.accent))}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-black text-white">{agent.name}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-60">{agent.role}</div>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest opacity-45">
          {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]/90">{message.content}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest', riskTone(message.riskLevel || 'low'))}>
          {message.riskLevel || 'low'} risk
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-[var(--error)]/25 bg-[var(--error-dim)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--error)]">
            approval required
          </span>
        )}
        {message.metadata?.secretRedacted && (
          <span className="rounded-full border border-[var(--warning)]/25 bg-[var(--warning-dim)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--warning)]">
            secret redacted
          </span>
        )}
      </div>
    </div>
  );
}

interface Task {
  id: string;
  title: string;
  status: MissionTaskStatus;
  priority: string;
  owner: string;
  riskLevel?: string;
  approvalRequired?: boolean;
  acceptance?: string;
  proof?: string;
}

function TaskCard({ task, onUpdate }: { task: Task; onUpdate: (taskId: string, patch: Partial<Task>) => void }) {
  const owner = lookupAgent(task.owner);
  return (
    <div className="rounded-3xl border border-white/10 bg-[var(--surface-1)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{task.title}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)]">{task.priority} · {owner.name}</div>
        </div>
        <select
          aria-label={`Status for ${task.title}`}
          value={task.status}
          onChange={(event) => onUpdate(task.id, { status: event.target.value as MissionTaskStatus })}
          className={cx('rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest outline-none', statusTone(task.status))}
        >
          {MISSION_TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest', riskTone(task.riskLevel || 'low'))}>{task.riskLevel || 'low'} risk</span>
        {task.approvalRequired && <span className="rounded-full border border-[var(--error)]/25 bg-[var(--error-dim)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--error)]">approval required</span>}
      </div>
      {task.acceptance && <div className="mt-3 text-xs leading-relaxed text-[var(--text-3)]"><b className="text-[var(--text-2)]">Acceptance:</b> {task.acceptance}</div>}
      {task.proof && <div className="mt-2 text-xs leading-relaxed text-[var(--text-3)]"><b className="text-[var(--text-2)]">Proof:</b> {task.proof}</div>}
    </div>
  );
}

interface Props {
  onCreateApprovalRequest?: (data: { source: string; actionType: string; riskLevel: string; summary: string }) => void;
}

export function MissionRoom({ onCreateApprovalRequest }: Props) {
  const [room] = useState(() => getMissionRoom());
  const [messages, setMessages] = useState<Message[]>(() => listMissionMessages(room.id));
  const [tasks, setTasks] = useState<Task[]>(() => listMissionTasks(room.id));
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>(() => listMissionSecurityEvents(room.id));
  const [input, setInput] = useState<string>('');
  const [speaker, setSpeaker] = useState<string>('user');
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [taskAcceptance, setTaskAcceptance] = useState<string>('');
  const [handoffProject, setHandoffProject] = useState<string>('TapCash');
  const [handoffObjective, setHandoffObjective] = useState<string>('Audit TapCash and report publish blockers. Do not publish.');
  const [handoffText, setHandoffText] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const taskStats = useMemo(() => {
    return MISSION_TASK_STATUSES.reduce((acc: Record<string, number>, status) => ({ ...acc, [status]: tasks.filter((task) => task.status === status).length }), {});
  }, [tasks]);

  const approvalRequiredCount = useMemo(() => (
    messages.filter((message) => message.approvalRequired).length + tasks.filter((task) => task.approvalRequired).length
  ), [messages, tasks]);

  const reload = () => {
    setMessages(listMissionMessages(room.id));
    setTasks(listMissionTasks(room.id));
    setSecurityEvents(listMissionSecurityEvents(room.id));
  };

  useEffect(() => {
    if (messages.length === 0) {
      addMissionMessage({
        roomId: room.id,
        speaker: 'alphonso',
        kind: 'system',
        content: 'Mission Room online. Current scope: Shayan + ALPHONSO boardroom. External publish/delete/push/spend actions stay approval-gated.'
      });
      addMissionTask({
        roomId: room.id,
        title: 'Wire the remaining agent runtimes',
        owner: 'alphonso',
        status: 'todo',
        priority: 'P1',
        acceptance: 'Documented runtime contract per seat, verified handoffs, and summarized status in a Mission Room message.',
        proof: 'Changed files, connector configs, run commands, and test/build outputs.'
      });
      addMissionMessage({
        roomId: room.id,
        speaker: 'jose',
        kind: 'task',
        content: 'Assigned: Wire the remaining agent runtimes. Acceptance: documented runtime contract per seat, verified handoffs, and summarized status.'
      });
      reload();
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const sendMessage = () => {
    const msg = addMissionMessage({ roomId: room.id, speaker, content: input });
    if (msg) {
      setInput('');
      reload();
    }
  };

  const createTask = () => {
    const task = addMissionTask({
      roomId: room.id,
      title: taskTitle,
      owner: 'alphonso',
      status: 'todo',
      priority: 'P1',
      acceptance: taskAcceptance || 'Evidence-backed report with changed files, checks, blockers, and risks.'
    });
    if (task) {
      addMissionMessage({ roomId: room.id, speaker: 'alphonso', kind: 'task', content: `Assigned: ${task.title}` });
      setTaskTitle('');
      setTaskAcceptance('');
      reload();
    }
  };

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    updateMissionTask(taskId, patch);
    reload();
  };

  const generateHandoff = async () => {
    const text = createHermesHandoff({
      project: handoffProject,
      objective: handoffObjective,
      acceptance: 'Return readiness score, blockers, changed files, verification commands/results, and next action.'
    });
    setHandoffText(text);
    addMissionMessage({ roomId: room.id, speaker: 'alphonso', kind: 'handoff', content: `Mission brief drafted for ${handoffProject}. Awaiting copy/send by Shayan.` });
    reload();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable in tests or locked browsers.
    }
  };

  const clearRoom = () => {
    clearMissionMessages(room.id);
    reload();
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 alphonso-premium-ui">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[var(--surface-0)] p-6 shadow-[0_0_110px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.2),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(245,158,11,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent)]">
              <RadioTower className="h-3.5 w-3.5" /> Shared command table
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white md:text-6xl">Mission Room</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
              A local-first meeting board for Shayan, Kite, and Hermes. Use it to capture decisions, assign execution work, paste Hermes outputs, and keep approvals explicit.
            </p>
          </div>
          <div className="grid w-full max-w-md grid-cols-3 gap-2">
            {MISSION_TASK_STATUSES.slice(0, 5).map((status) => (
              <div key={status} className={cx('rounded-2xl border p-3 text-center', statusTone(status))}>
                <div className="text-xl font-black">{taskStats[status] || 0}</div>
                <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
        {room.selectedAgents.map((agentKey: string) => <AgentCard key={agentKey} agentKey={agentKey} />)}
        {(room.openParticipantSlots || []).map((slot, index) => <AgentCard key={slot || index} agentKey={slot || 'reserved'} reservedSlot={slot} />)}
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Conversation</div>
              <div className="mt-1 text-sm font-semibold text-white">{room.name}</div>
            </div>
            <button type="button" onClick={clearRoom} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--text-3)] hover:text-[var(--error)]">
              Clear local chat
            </button>
          </div>
          <div ref={scrollRef} className="h-[520px] space-y-3 overflow-y-auto rounded-[1.5rem] border border-white/5 bg-black/20 p-3">
            {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-[1.5rem] border border-white/10 bg-[var(--surface-0)] p-3 md:flex-row">
            <select aria-label="Speaking as" value={speaker} onChange={(event) => setSpeaker(event.target.value)} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-[var(--text-2)] outline-none">
              {Object.values(MISSION_ROOM_AGENTS).map((agent) => <option key={agent.key} value={agent.key}>{agent.name}</option>)}
            </select>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Drop meeting notes, Hermes output, blockers, or decisions..."
              className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
            />
            <button type="button" onClick={sendMessage} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-black hover:opacity-90">
              <Send className="h-4 w-4" /> Send
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Hermes tasking</div>
                <div className="mt-1 text-sm font-semibold text-white">Create worker assignment</div>
              </div>
              <Plus className="h-5 w-5 text-[var(--accent)]/70" />
            </div>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Task title, e.g. Audit TapCash publish blockers"
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
            />
            <textarea
              value={taskAcceptance}
              onChange={(event) => setTaskAcceptance(event.target.value)}
              placeholder="Acceptance criteria / proof needed"
              className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
            />
            <button type="button" onClick={createTask} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-dim)] px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--accent-dim)]/70">
              <Hammer className="h-4 w-4" /> Assign to Hermes
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-4">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-[var(--warning)]/80" />
              <div>
                <div className="text-sm font-black text-white">Approval gate</div>
                <div className="text-xs text-[var(--text-3)]">Publish / external / destructive actions require Shayan. Open flags: {approvalRequiredCount}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCreateApprovalRequest?.({ source: 'mission-room', actionType: 'external_worker_action', riskLevel: 'high', summary: 'Mission Room approval placeholder' })}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--warning)]/20 bg-[var(--warning-dim)] px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--warning)] hover:bg-[var(--warning-dim)]/70"
            >
              <Shield className="h-4 w-4" /> Approval placeholder
            </button>
          </div>

          <div className="rounded-[2rem] border border-[var(--error)]/15 bg-[var(--error-dim)]/50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-[var(--error)]/80" />
              <div>
                <div className="text-sm font-black text-white">Security model</div>
                <div className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">Bulletproof means layered and honest: this v1 is a local guardrail, not a tamper-proof security boundary.</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {MISSION_ROOM_SECURITY_MODEL.guarantees.map((item) => (
                <div key={item} className="rounded-2xl border border-[var(--success)]/10 bg-[var(--success-dim)]/50 p-2 text-[11px] leading-relaxed text-[var(--success)]/80">✓ {item}</div>
              ))}
              {MISSION_ROOM_SECURITY_MODEL.nonGuarantees.slice(0, 2).map((item) => (
                <div key={item} className="rounded-2xl border border-[var(--warning)]/10 bg-[var(--warning-dim)]/50 p-2 text-[11px] leading-relaxed text-[var(--warning)]/80">! {item}</div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Handoff generator</div>
                <div className="mt-1 text-sm font-semibold text-white">Copy-safe Hermes brief</div>
              </div>
              <Clipboard className="h-5 w-5 text-[var(--text-3)]" />
            </div>
            <input value={handoffProject} onChange={(event) => setHandoffProject(event.target.value)} className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-[var(--text-1)] outline-none" />
            <textarea value={handoffObjective} onChange={(event) => setHandoffObjective(event.target.value)} className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[var(--text-1)] outline-none" />
            <button type="button" onClick={generateHandoff} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-black hover:opacity-90">
              <Sparkles className="h-4 w-4" /> Generate + copy handoff
            </button>
            {handoffText && <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-[var(--text-2)]">{handoffText}</pre>}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Task board</div>
            <div className="mt-1 text-sm text-[var(--text-3)]">Local board for Hermes assignments and Kite review.</div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-3)]">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]/70" /> Evidence first
          </div>
        </div>
        {tasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-[var(--text-3)]">
            No Hermes tasks yet. Create one above when you want a worker lane.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => <TaskCard key={task.id} task={task} onUpdate={updateTask} />)}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[2rem] border border-white/10 bg-[var(--surface-1)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Security audit trail</div>
            <div className="mt-1 text-sm text-[var(--text-3)]">Local hash-chained events for messages, task changes, redactions, and approval flags.</div>
          </div>
          <Shield className="h-5 w-5 text-[var(--accent)]/70" />
        </div>
        {securityEvents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-[var(--text-3)]">No security events yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {securityEvents.slice(0, 9).map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-2)]">{event.type}</span>
                  <span className={cx('rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest', riskTone(event.riskLevel))}>{event.riskLevel}</span>
                </div>
                <div className="mt-2 line-clamp-2 text-xs text-[var(--text-3)]">{event.summary}</div>
                <div className="mt-2 truncate text-[9px] font-mono text-[var(--text-4)]">{event.eventHash}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-[var(--success)]/15 bg-[var(--success-dim)] p-4 text-[var(--success)]">
          <Crown className="h-5 w-5" />
          <div className="mt-2 text-sm font-black text-white">Shayan decides</div>
          <div className="mt-1 text-xs leading-relaxed opacity-75">Final approval before public actions or sensitive access.</div>
        </div>
        <div className="rounded-3xl border border-[var(--accent-border)] bg-[var(--accent-dim)] p-4 text-[var(--accent)]">
          <MessageSquare className="h-5 w-5" />
          <div className="mt-2 text-sm font-black text-white">Kite commands</div>
          <div className="mt-1 text-xs leading-relaxed opacity-75">Planning, QA, handoffs, truth checks, and risk flags.</div>
        </div>
        <div className="rounded-3xl border border-[var(--warning)]/15 bg-[var(--warning-dim)] p-4 text-[var(--warning)]">
          <ExternalLink className="h-5 w-5" />
          <div className="mt-2 text-sm font-black text-white">Hermes executes</div>
          <div className="mt-1 text-xs leading-relaxed opacity-75">External work comes back here as evidence, not unchecked claims.</div>
        </div>
      </section>
    </div>
  );
}
