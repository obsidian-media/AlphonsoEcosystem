import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clipboard, ClipboardList, Crown, Clapperboard, Hammer, LockKeyhole, Palette, Plus, RadioTower, Send, Shield, Sparkles, User } from 'lucide-react';
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

// Real agent identity colors, keyed by agent key rather than the
// MISSION_ROOM_AGENTS.accent Tailwind-family field. That field was a
// second, independently-hand-picked palette that had drifted from the
// app's real --agent-* identity tokens in tokens.css (e.g. Sentinel is
// red everywhere else in the app -- security = danger -- and was 'red'
// here too only by coincidence; Hector is indigo everywhere else but
// was 'violet' here, Miya is violet everywhere else but was 'pink'
// here, Maria is teal everywhere else but was 'emerald' here, Nova is
// lime everywhere else but was 'fuchsia' here). Keying directly off the
// real token per agent -- matching the established pattern already used
// by AgentStatusStrip.tsx/AgentActivityLog.tsx/BoardroomView.tsx --
// removes the second, drifting palette entirely instead of
// re-approximating it with yet another hand-picked Tailwind family.
const AGENT_TONE_CLASS: Record<string, string> = {
  alphonso: 'bg-[var(--agent-alphonso-glow)] text-[var(--agent-alphonso)]',
  jose: 'bg-[var(--agent-jose-glow)] text-[var(--agent-jose)]',
  hector: 'bg-[var(--agent-hector-glow)] text-[var(--agent-hector)]',
  miya: 'bg-[var(--agent-miya-glow)] text-[var(--agent-miya)]',
  maria: 'bg-[var(--agent-maria-glow)] text-[var(--agent-maria)]',
  marcus: 'bg-[var(--agent-marcus-glow)] text-[var(--agent-marcus)]',
  echo: 'bg-[var(--agent-echo-glow)] text-[var(--agent-echo)]',
  sentinel: 'bg-[var(--agent-sentinel-glow)] text-[var(--agent-sentinel)]',
  nova: 'bg-[var(--agent-nova-glow)] text-[var(--agent-nova)]',
  // 'user' is the human founder, not a real agent -- no --agent-* token to
  // key off of, kept as a distinct hardcoded border/bg tone matching this
  // session's established "deliberate, not tokenized" carve-out pattern
  // (bug-log.md #15/#16/#18). Text uses the real --success token, not a
  // hardcoded pale Tailwind shade (text-emerald-100 was a real light-mode
  // bug -- illegible near-white text on a near-white card). 'kairo' (a
  // fictional legacy roster entry) was here too until it was found and
  // removed from MISSION_ROOM_AGENTS itself -- see missionRoomService.ts.
  user: 'bg-emerald-500/10 text-[var(--success)]',
};

function agentTone(key: string) {
  return AGENT_TONE_CLASS[key] || AGENT_TONE_CLASS.alphonso;
}

function statusTone(status: string) {
  if (status === 'approved') return 'border-[var(--success-border)] bg-[var(--success-dim)] text-[var(--success)]';
  if (status === 'review') return 'border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]';
  if (status === 'doing') return 'border-[var(--warning-border)] bg-[var(--warning-dim)] text-[var(--warning)]';
  if (status === 'blocked') return 'border-[var(--error-border)] bg-[var(--error-dim)] text-[var(--error)]';
  return 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)]';
}

function statusTextTone(status: string) {
  if (status === 'approved') return 'text-[var(--success)]';
  if (status === 'review') return 'text-[var(--accent)]';
  if (status === 'doing') return 'text-[var(--warning)]';
  if (status === 'blocked') return 'text-[var(--error)]';
  return 'text-[var(--text-2)]';
}

function riskTone(riskLevel: string) {
  if (riskLevel === 'high') return 'border-[var(--error-border)] bg-[var(--error-dim)] text-[var(--error)]';
  if (riskLevel === 'medium') return 'border-[var(--warning-border)] bg-[var(--warning-dim)] text-[var(--warning)]';
  return 'border-[var(--success-border)] bg-[var(--success-dim)] text-[var(--success)]';
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
      <div className="flex items-center gap-2.5 text-[var(--text-3)]" title="Kept intentionally blank until you approve another participant lane.">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
          <Plus className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs font-black text-[var(--text-2)]">Empty slot</div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-65">reserved later</div>
        </div>
      </div>
    );
  }
  const agent = lookupAgent(agentKey);
  const Icon = speakerIcon(agentKey);
  return (
    <div className="flex items-center gap-2.5" title={agent.role}>
      <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', agentTone(agent.key))}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-black text-[var(--text-1)]">{agent.name}</div>
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-65">{agent.lane}</div>
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
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', agentTone(agent.key))}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-black text-[var(--text-1)]">{agent.name}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-60">{agent.role}</div>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest opacity-45">
          {message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-1)]">{message.content}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest', riskTone(message.riskLevel || 'low'))}>
          {message.riskLevel || 'low'} risk
        </span>
        {message.approvalRequired && (
          <span className="rounded-full border border-[var(--error-border)] bg-[var(--error-dim)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--error)]">
            approval required
          </span>
        )}
        {message.metadata?.secretRedacted && (
          <span className="rounded-full border border-[var(--warning-border)] bg-[var(--warning-dim)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--warning)]">
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
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-[var(--text-1)]">{task.title}</div>
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
        {task.approvalRequired && <span className="rounded-full border border-[var(--error-border)] bg-[var(--error-dim)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[var(--error)]">approval required</span>}
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
        content: 'Mission Room online. Current scope: you + ALPHONSO boardroom. External publish/delete/push/spend actions stay approval-gated.'
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
    addMissionMessage({ roomId: room.id, speaker: 'alphonso', kind: 'handoff', content: `Mission brief drafted for ${handoffProject}. Awaiting copy/send by you.` });
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
    <div className="h-full overflow-y-auto mx-auto max-w-7xl px-6 py-6 alphonso-premium-ui">
      <section className="flex flex-col gap-6 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-dim)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent)]">
            <RadioTower className="h-3.5 w-3.5" /> Shared command table
          </div>
          <h1 className="mt-4 font-serif text-4xl font-black tracking-[-0.055em] text-[var(--text-1)] md:text-6xl">Mission Room</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
            A local-first meeting board for you, Kite, and Hermes. Use it to capture decisions, assign execution work, paste Hermes outputs, and keep approvals explicit.
          </p>
        </div>
        <div className="flex w-full max-w-md flex-wrap gap-x-6 gap-y-3">
          {MISSION_TASK_STATUSES.slice(0, 5).map((status) => (
            <div key={status} className="text-center">
              <div className={cx('text-xl font-black', statusTextTone(status))}>{taskStats[status] || 0}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-3)]">{status}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--border)] pb-4">
        {room.selectedAgents.map((agentKey: string) => <AgentCard key={agentKey} agentKey={agentKey} />)}
        {(room.openParticipantSlots || []).map((slot, index) => <AgentCard key={slot || index} agentKey={slot || 'reserved'} reservedSlot={slot} />)}
      </section>

      <section className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Conversation</div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-1)]">{room.name}</div>
            </div>
            <button type="button" onClick={clearRoom} className="text-[10px] font-black uppercase tracking-widest text-[var(--text-3)] hover:text-[var(--error)]">
              Clear local chat
            </button>
          </div>
          <div ref={scrollRef} className="h-[520px] divide-y divide-[var(--border)] overflow-y-auto pr-1">
            {messages.map((message) => <div key={message.id} className="py-3 first:pt-0 last:pb-0"><MessageBubble message={message} /></div>)}
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3 md:flex-row">
            <select aria-label="Speaking as" value={speaker} onChange={(event) => setSpeaker(event.target.value)} className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm font-bold text-[var(--text-2)] outline-none">
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
              className="min-h-12 flex-1 resize-none rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
            />
            <button type="button" onClick={sendMessage} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--text-1)] px-4 py-2 text-sm font-black text-[var(--surface-0)] hover:opacity-90">
              <Send className="h-4 w-4" /> Send
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--border)]">
          <div className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Hermes tasking</div>
                <div className="mt-1 text-sm font-semibold text-[var(--text-1)]">Create worker assignment</div>
              </div>
              <Plus className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Task title, e.g. Audit TapCash publish blockers"
              className="mt-4 w-full rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
            />
            <textarea
              value={taskAcceptance}
              onChange={(event) => setTaskAcceptance(event.target.value)}
              placeholder="Acceptance criteria / proof needed"
              className="mt-2 min-h-24 w-full resize-none rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)] outline-none placeholder:text-[var(--text-4)]"
            />
            <button type="button" onClick={createTask} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent-dim)] px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--accent)] hover:opacity-90">
              <Hammer className="h-4 w-4" /> Assign to Hermes
            </button>
          </div>

          <div className="py-4">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-[var(--warning)]" />
              <div>
                <div className="text-sm font-black text-[var(--text-1)]">Approval gate</div>
                <div className="text-xs text-[var(--text-3)]">Publish / external / destructive actions require your approval. Open flags: {approvalRequiredCount}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCreateApprovalRequest?.({ source: 'mission-room', actionType: 'external_worker_action', riskLevel: 'high', summary: 'Mission Room approval placeholder' })}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--warning-dim)] px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--warning)] hover:opacity-90"
            >
              <Shield className="h-4 w-4" /> Approval placeholder
            </button>
          </div>

          <div className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-[var(--error)]" />
              <div>
                <div className="text-sm font-black text-[var(--text-1)]">Security model</div>
                <div className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">Bulletproof means layered and honest: this v1 is a local guardrail, not a tamper-proof security boundary.</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {MISSION_ROOM_SECURITY_MODEL.guarantees.map((item) => (
                <div key={item} className="text-[11px] leading-relaxed text-[var(--success)]">✓ {item}</div>
              ))}
              {MISSION_ROOM_SECURITY_MODEL.nonGuarantees.slice(0, 2).map((item) => (
                <div key={item} className="text-[11px] leading-relaxed text-[var(--warning)]">! {item}</div>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Handoff generator</div>
                <div className="mt-1 text-sm font-semibold text-[var(--text-1)]">Copy-safe Hermes brief</div>
              </div>
              <Clipboard className="h-5 w-5 text-[var(--text-3)]" />
            </div>
            <input aria-label="Handoff project name" value={handoffProject} onChange={(event) => setHandoffProject(event.target.value)} className="mt-4 w-full rounded-lg bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-1)] outline-none" />
            <textarea aria-label="Handoff objective" value={handoffObjective} onChange={(event) => setHandoffObjective(event.target.value)} className="mt-2 min-h-20 w-full resize-none rounded-lg bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-1)] outline-none" />
            <button type="button" onClick={generateHandoff} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--text-1)] px-4 py-3 text-xs font-black uppercase tracking-widest text-[var(--surface-0)] hover:opacity-90">
              <Sparkles className="h-4 w-4" /> Generate + copy handoff
            </button>
            {handoffText && <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed text-[var(--text-2)]">{handoffText}</pre>}
          </div>
        </div>
      </section>

      <section className="mt-6 border-t border-[var(--border)] pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Task board</div>
            <div className="mt-1 text-sm text-[var(--text-3)]">Local board for Hermes assignments and Kite review.</div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-3)]">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> Evidence first
          </div>
        </div>
        {tasks.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--text-3)]">
            No Hermes tasks yet. Create one above when you want a worker lane.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {tasks.map((task) => <TaskCard key={task.id} task={task} onUpdate={updateTask} />)}
          </div>
        )}
      </section>

      <section className="mt-6 border-t border-[var(--border)] pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-3)]">Security audit trail</div>
            <div className="mt-1 text-sm text-[var(--text-3)]">Local hash-chained events for messages, task changes, redactions, and approval flags.</div>
          </div>
          <Shield className="h-5 w-5 text-[var(--accent)]" />
        </div>
        {securityEvents.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--text-3)]">No security events yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {securityEvents.slice(0, 9).map((event) => (
              <div key={event.id} className="py-3 first:pt-0 last:pb-0">
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
    </div>
  );
}
