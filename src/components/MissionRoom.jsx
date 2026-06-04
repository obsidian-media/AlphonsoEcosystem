import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clipboard, ClipboardList, Crown, Clapperboard, ExternalLink, Hammer, LockKeyhole, MessageSquare, Plus, RadioTower, Send, Shield, Sparkles, User, Zap } from 'lucide-react';
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
  updateMissionTask
} from '../services/missionRoomService';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function agentTone(accent) {
  if (accent === 'emerald') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100 shadow-[0_0_36px_rgba(16,185,129,0.08)]';
  if (accent === 'amber') return 'border-amber-300/20 bg-amber-500/10 text-amber-100 shadow-[0_0_36px_rgba(245,158,11,0.08)]';
  return 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100 shadow-[0_0_36px_rgba(34,211,238,0.08)]';
}

function statusTone(status) {
  if (status === 'approved') return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
  if (status === 'review') return 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100';
  if (status === 'doing') return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  if (status === 'blocked') return 'border-red-300/20 bg-red-500/10 text-red-100';
  return 'border-white/10 bg-zinc-900/60 text-zinc-300';
}

function riskTone(riskLevel) {
  if (riskLevel === 'high') return 'border-red-300/25 bg-red-500/10 text-red-100';
  if (riskLevel === 'medium') return 'border-amber-300/25 bg-amber-500/10 text-amber-100';
  return 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100';
}

function speakerIcon(speaker) {
  if (speaker === 'shayan') return User;
  if (speaker === 'alphonso') return Bot;
  if (speaker === 'jose') return Crown;
  if (speaker === 'hector') return ClipboardList;
  if (speaker === 'miya') return Clapperboard;
  if (speaker === 'maria') return Shield;
  if (speaker === 'marcus') return Send;
  if (speaker === 'echo') return RadioTower;
  if (speaker === 'sentinel') return LockKeyhole;
  if (speaker === 'nova') return Zap;
  return Bot;
}

const lookupAgent = (key) => MISSION_ROOM_AGENTS[key] || MISSION_ROOM_AGENTS.alphonso || MISSION_ROOM_AGENTS.jose || Object.values(MISSION_ROOM_AGENTS)[0] || { name: 'Unknown', role: 'unknown', accent: 'zinc' };

function AgentCard({ agentKey, reservedSlot }) {
  if (reservedSlot) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 bg-zinc-950/35 p-4 text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-black text-zinc-300">Empty slot</div>
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

function MessageBubble({ message }) {
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
      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100/90">{message.content}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest', riskTone(message.riskLevel || 'low'))}>
          {message.riskLevel || 'low'} risk
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-red-100">
            approval required
          </span>
        )}
        {message.metadata?.secretRedacted && (
          <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-amber-100">
            secret redacted
          </span>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onUpdate }) {
  const owner = lookupAgent(task.owner);
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{task.title}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{task.priority} · {owner.name}</div>
        </div>
        <select
          value={task.status}
          onChange={(event) => onUpdate(task.id, { status: event.target.value })}
          className={cx('rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest outline-none', statusTone(task.status))}
        >
          {MISSION_TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest', riskTone(task.riskLevel || 'low'))}>{task.riskLevel || 'low'} risk</span>
        {task.approvalRequired && <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-red-100">approval required</span>}
      </div>
      {task.acceptance && <div className="mt-3 text-xs leading-relaxed text-zinc-400"><b className="text-zinc-200">Acceptance:</b> {task.acceptance}</div>}
      {task.proof && <div className="mt-2 text-xs leading-relaxed text-zinc-400"><b className="text-zinc-200">Proof:</b> {task.proof}</div>}
    </div>
  );
}

export function MissionRoom({ onCreateApprovalRequest }) {
  const [room] = useState(() => getMissionRoom());
  const [messages, setMessages] = useState(() => listMissionMessages(room.id));
  const [tasks, setTasks] = useState(() => listMissionTasks(room.id));
  const [securityEvents, setSecurityEvents] = useState(() => listMissionSecurityEvents(room.id));
  const [input, setInput] = useState('');
  const [speaker, setSpeaker] = useState('shayan');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAcceptance, setTaskAcceptance] = useState('');
  const [handoffProject, setHandoffProject] = useState('TapCash');
  const [handoffObjective, setHandoffObjective] = useState('Audit TapCash and report publish blockers. Do not publish.');
  const [handoffText, setHandoffText] = useState('');
  const scrollRef = useRef(null);

  const taskStats = useMemo(() => {
    return MISSION_TASK_STATUSES.reduce((acc, status) => ({ ...acc, [status]: tasks.filter((task) => task.status === status).length }), {});
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

  const updateTask = (taskId, patch) => {
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
      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-zinc-950/80 p-6 shadow-[0_0_110px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.2),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(245,158,11,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100">
              <RadioTower className="h-3.5 w-3.5" /> Shared command table
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white md:text-6xl">Mission Room</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300">
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
        {room.selectedAgents.map((agentKey) => <AgentCard key={agentKey} agentKey={agentKey} />)}
        {(room.openParticipantSlots || []).map((slot) => <AgentCard key={slot.id} reservedSlot={slot} />)}
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-white/10 bg-zinc-950/65 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Conversation</div>
              <div className="mt-1 text-sm font-semibold text-white">{room.name}</div>
            </div>
            <button type="button" onClick={clearRoom} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-200">
              Clear local chat
            </button>
          </div>
          <div ref={scrollRef} className="h-[520px] space-y-3 overflow-y-auto rounded-[1.5rem] border border-white/5 bg-black/20 p-3">
            {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          </div>
          <div className="mt-3 flex flex-col gap-2 rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-3 md:flex-row">
            <select value={speaker} onChange={(event) => setSpeaker(event.target.value)} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-zinc-200 outline-none">
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
              className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button type="button" onClick={sendMessage} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-black hover:bg-zinc-200">
              <Send className="h-4 w-4" /> Send
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/65 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Hermes tasking</div>
                <div className="mt-1 text-sm font-semibold text-white">Create worker assignment</div>
              </div>
              <Plus className="h-5 w-5 text-cyan-200/70" />
            </div>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Task title, e.g. Audit TapCash publish blockers"
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <textarea
              value={taskAcceptance}
              onChange={(event) => setTaskAcceptance(event.target.value)}
              placeholder="Acceptance criteria / proof needed"
              className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button type="button" onClick={createTask} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/20">
              <Hammer className="h-4 w-4" /> Assign to Hermes
            </button>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/65 p-4">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-amber-200/80" />
              <div>
                <div className="text-sm font-black text-white">Approval gate</div>
                <div className="text-xs text-zinc-500">Publish / external / destructive actions require Shayan. Open flags: {approvalRequiredCount}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCreateApprovalRequest?.({ source: 'mission-room', actionType: 'external_worker_action', riskLevel: 'high', summary: 'Mission Room approval placeholder' })}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-amber-100 hover:bg-amber-500/20"
            >
              <Shield className="h-4 w-4" /> Approval placeholder
            </button>
          </div>

          <div className="rounded-[2rem] border border-red-300/15 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-red-200/80" />
              <div>
                <div className="text-sm font-black text-white">Security model</div>
                <div className="mt-1 text-xs leading-relaxed text-zinc-400">Bulletproof means layered and honest: this v1 is a local guardrail, not a tamper-proof security boundary.</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {MISSION_ROOM_SECURITY_MODEL.guarantees.map((item) => (
                <div key={item} className="rounded-2xl border border-emerald-300/10 bg-emerald-500/5 p-2 text-[11px] leading-relaxed text-emerald-100/80">✓ {item}</div>
              ))}
              {MISSION_ROOM_SECURITY_MODEL.nonGuarantees.slice(0, 2).map((item) => (
                <div key={item} className="rounded-2xl border border-amber-300/10 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-100/80">! {item}</div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-zinc-950/65 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Handoff generator</div>
                <div className="mt-1 text-sm font-semibold text-white">Copy-safe Hermes brief</div>
              </div>
              <Clipboard className="h-5 w-5 text-zinc-400" />
            </div>
            <input value={handoffProject} onChange={(event) => setHandoffProject(event.target.value)} className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-100 outline-none" />
            <textarea value={handoffObjective} onChange={(event) => setHandoffObjective(event.target.value)} className="mt-2 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none" />
            <button type="button" onClick={generateHandoff} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-zinc-200">
              <Sparkles className="h-4 w-4" /> Generate + copy handoff
            </button>
            {handoffText && <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">{handoffText}</pre>}
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[2rem] border border-white/10 bg-zinc-950/65 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Task board</div>
            <div className="mt-1 text-sm text-zinc-400">Local board for Hermes assignments and Kite review.</div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-300/70" /> Evidence first
          </div>
        </div>
        {tasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-500">
            No Hermes tasks yet. Create one above when you want a worker lane.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => <TaskCard key={task.id} task={task} onUpdate={updateTask} />)}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[2rem] border border-white/10 bg-zinc-950/65 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Security audit trail</div>
            <div className="mt-1 text-sm text-zinc-400">Local hash-chained events for messages, task changes, redactions, and approval flags.</div>
          </div>
          <Shield className="h-5 w-5 text-cyan-200/70" />
        </div>
        {securityEvents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-zinc-500">No security events yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {securityEvents.slice(0, 9).map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300">{event.type}</span>
                  <span className={cx('rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest', riskTone(event.riskLevel))}>{event.riskLevel}</span>
                </div>
                <div className="mt-2 line-clamp-2 text-xs text-zinc-500">{event.summary}</div>
                <div className="mt-2 truncate text-[9px] font-mono text-zinc-700">{event.eventHash}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-emerald-300/15 bg-emerald-500/10 p-4 text-emerald-100">
          <Crown className="h-5 w-5" />
          <div className="mt-2 text-sm font-black text-white">Shayan decides</div>
          <div className="mt-1 text-xs leading-relaxed opacity-75">Final approval before public actions or sensitive access.</div>
        </div>
        <div className="rounded-3xl border border-cyan-300/15 bg-cyan-500/10 p-4 text-cyan-100">
          <MessageSquare className="h-5 w-5" />
          <div className="mt-2 text-sm font-black text-white">Kite commands</div>
          <div className="mt-1 text-xs leading-relaxed opacity-75">Planning, QA, handoffs, truth checks, and risk flags.</div>
        </div>
        <div className="rounded-3xl border border-amber-300/15 bg-amber-500/10 p-4 text-amber-100">
          <ExternalLink className="h-5 w-5" />
          <div className="mt-2 text-sm font-black text-white">Hermes executes</div>
          <div className="mt-1 text-xs leading-relaxed opacity-75">External work comes back here as evidence, not unchecked claims.</div>
        </div>
      </section>
    </div>
  );
}
