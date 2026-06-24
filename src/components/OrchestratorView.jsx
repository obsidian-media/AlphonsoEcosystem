import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Brain,
  MessageCircle,
  CheckCircle2,
  ClipboardList,
  Crown,
  Database,
  GitBranch,
  Gauge,
  Network,
  RefreshCw,
  Route,
  ShieldCheck,
  Users
} from 'lucide-react';
import {
  AGENTS,
  approvePacket,
  canExecutePacket,
  createAgentPacket,
  listAgentPackets,
  listApprovalQueue,
  rejectPacket,
  updatePacketStatus
} from '../services/agentBusService';
import { listMemoryItems } from '../services/memoryService';
import { listMiyaMemory } from '../services/miyaMemoryService';
import { listWorkflows } from '../services/workflowBuilderService';
import { appendSessionEvent, listSessionEvents } from '../services/sessionIntelligenceService';
import { summarizeResourceUsage } from '../services/resourceCostService';
import {
  listGovernanceDecisions,
  recordGovernanceDecision,
  summarizeAgentWorkload
} from '../services/orchestrationGovernanceService';
import {
  confirmJoseCommand,
  createAgentReportToJose,
  createJoseCommandRoute,
  getJoseWorkflowObservability,
  listJoseCommands,
  listJoseDeadLetters,
  runJoseRetrySweep
} from '../services/joseCommandRouterService';
import { executeApprovedPacket } from '../services/packetExecutionService';
import { TRUST_STATES } from '../services/trustModel';
import { isConnectorAuthenticated, listConnectorAudit, pollWhatsAppConnector } from '../services/connectorRegistryService';
import { getOrchestrationQueueSnapshot, listOrchestrationQueueTransitions, replayPacketFromDeadLetter } from '../services/orchestrationQueueService';
import { AgentAvatar } from './AgentAvatar';
import { JoseTaskQueue } from './JoseTaskQueue';
import { WhatsAppInboxPanel } from './WhatsAppInboxPanel';
import { OrchestratorQueueView } from './OrchestratorQueueView';

export function OrchestratorView({
  settings,
  ollamaStatus,
  onJoseStateChange
}) {
  const [packets, setPackets] = useState(() => listAgentPackets());
  const [decisions, setDecisions] = useState(() => listGovernanceDecisions());
  const [memoryItems, setMemoryItems] = useState(() => listMemoryItems());
  const [miyaMemory, setMiyaMemory] = useState(() => listMiyaMemory());
  const [workflows, setWorkflows] = useState(() => listWorkflows());
  const [sessionEvents, setSessionEvents] = useState(() => listSessionEvents());
  const [resourceSummary, setResourceSummary] = useState(() => summarizeResourceUsage(24));
  const [routeTitle, setRouteTitle] = useState('Review creative packet and prepare execution plan');
  const [routeTarget, setRouteTarget] = useState(AGENTS.ALPHONSO);
  const [joseCommandText, setJoseCommandText] = useState('Create a YouTube video package: Miya drafts the script, Alphonso verifies the local package/runtime, Hector checks source/publishing requirements, then Jose reports the final result back to Shayan.');
  const [joseCommands, setJoseCommands] = useState(() => listJoseCommands());
  const [workflowObs, setWorkflowObs] = useState(() => getJoseWorkflowObservability());
  const [deadLetters, setDeadLetters] = useState(() => listJoseDeadLetters());
  const [queueSnapshot, setQueueSnapshot] = useState(() => getOrchestrationQueueSnapshot());
  const [queueTransitions, setQueueTransitions] = useState(() => listOrchestrationQueueTransitions().slice(0, 80));
  const [whatsappAudit, setWhatsappAudit] = useState(() => listConnectorAudit().filter((e) => e.connectorId === 'whatsapp').slice(-30).reverse());
  const [whatsappPolling, setWhatsappPolling] = useState(false);
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('alphonso_jose_density_v1') !== 'full');
  const [openPanels, setOpenPanels] = useState(() => new Set(['jose-task-queue', 'jose-intake', 'pending-approvals']));
  const [executionResults, setExecutionResults] = useState([]);
  const [executingPacketIds, setExecutingPacketIds] = useState(new Set());
  const whatsappConfigured = isConnectorAuthenticated('whatsapp');

  const approvalQueue = useMemo(() => listApprovalQueue(), [packets]);
  const workload = useMemo(() => summarizeAgentWorkload(packets), [packets]);
  const runtimeState = ollamaStatus.state === 'connected' ? 'verified' : ollamaStatus.state === 'connecting' ? 'temporary' : 'failed';
  const duplicateCandidates = useMemo(() => findDuplicateCandidates(packets), [packets]);
  const conflictCandidates = useMemo(() => findConflictCandidates(packets), [packets]);
  const idleAgents = useMemo(() => workload.filter((row) => row.pending === 0 && row.inbound === 0).map((row) => row.agent), [workload]);
  const escalations = useMemo(() => packets.filter((packet) => ['high', 'critical'].includes(packet.riskLevel || '') || packet.status === 'rejected'), [packets]);

  useEffect(() => {
    localStorage.setItem('alphonso_jose_density_v1', focusMode ? 'focus' : 'full');
  }, [focusMode]);

  const togglePanel = (id) => {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshAll = () => {
    setPackets(listAgentPackets());
    setDecisions(listGovernanceDecisions());
    setMemoryItems(listMemoryItems());
    setMiyaMemory(listMiyaMemory());
    setWorkflows(listWorkflows());
    setSessionEvents(listSessionEvents());
    setResourceSummary(summarizeResourceUsage(24));
    setJoseCommands(listJoseCommands());
    setWorkflowObs(getJoseWorkflowObservability());
    setDeadLetters(listJoseDeadLetters());
    setQueueSnapshot(getOrchestrationQueueSnapshot());
    setQueueTransitions(listOrchestrationQueueTransitions().slice(0, 80));
    setWhatsappAudit(listConnectorAudit().filter((e) => e.connectorId === 'whatsapp').slice(-30).reverse());
  };

  const pollWhatsAppNow = async () => {
    if (whatsappPolling) return;
    setWhatsappPolling(true);
    try {
      await pollWhatsAppConnector(12);
      refreshAll();
    } catch { /* best-effort */ } finally {
      setWhatsappPolling(false);
    }
  };

  useEffect(() => {
    const handler = () => refreshAll();
    window.addEventListener('alphonso:ledger_hydrated', handler);
    return () => window.removeEventListener('alphonso:ledger_hydrated', handler);
  }, []);

  const recordDecision = () => {
    const decision = recordGovernanceDecision({
      title: 'Orchestration snapshot reviewed',
      summary: `Jose reviewed ${packets.length} packets, ${approvalQueue.length} approvals, and ${workflows.length} workflows.`,
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED,
      references: packets.slice(-3).map((packet) => packet.id)
    });
    appendSessionEvent({
      category: 'orchestration',
      title: 'Jose governance decision recorded',
      details: { id: decision.id },
      agent: AGENTS.JOSE,
      verificationState: TRUST_STATES.TEMPORARY
    });
    onJoseStateChange?.('task_complete', 'Governance snapshot recorded.');
    refreshAll();
  };

  const createRoutingPacket = () => {
    const packet = createAgentPacket({
      fromAgent: AGENTS.JOSE,
      toAgent: routeTarget,
      title: routeTitle,
      packetType: 'orchestration_route',
      payload: {
        focusMode: settings.focusMode || 'mission_control',
        environmentTheme: settings.environmentTheme || 'deep_space',
        note: 'Jose created this supervised routing packet. Execution still requires approval.'
      },
      source: 'jose-orchestrator-workspace',
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED,
      requiresApproval: true
    });
    appendSessionEvent({
      category: 'orchestration',
      title: 'Jose routing packet created',
      details: { id: packet.id, toAgent: routeTarget },
      agent: AGENTS.JOSE,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    onJoseStateChange?.('directing', 'Routing packet queued for approval.');
    refreshAll();
  };

  const approve = (packetId) => {
    approvePacket(packetId, AGENTS.JOSE);
    appendSessionEvent({
      category: 'approval',
      title: 'Jose approved packet',
      details: { packetId },
      agent: AGENTS.JOSE,
      verificationState: TRUST_STATES.TEMPORARY
    });
    onJoseStateChange?.('approving', 'Approval queue updated.');
    refreshAll();
  };

  const reject = (packetId) => {
    rejectPacket(packetId, 'Rejected from Jose Orchestrator review.');
    appendSessionEvent({
      category: 'approval',
      title: 'Jose rejected packet',
      details: { packetId },
      agent: AGENTS.JOSE,
      verificationState: TRUST_STATES.TEMPORARY
    });
    onJoseStateChange?.('warning', 'Packet rejected by operator review.');
    refreshAll();
  };

  const queueForExecution = (packetId) => {
    const packet = packets.find((item) => item.id === packetId);
    const gate = canExecutePacket(packet);
    if (!gate.ok) {
      appendSessionEvent({
        category: 'approval',
        title: 'Jose blocked queue action',
        details: { packetId, reason: gate.reason },
        agent: AGENTS.JOSE,
        verificationState: TRUST_STATES.FAILED
      });
      onJoseStateChange?.('warning', gate.reason || 'Queue action blocked.');
      refreshAll();
      return;
    }
    updatePacketStatus(packetId, 'queued', {
      routedBy: AGENTS.JOSE,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    appendSessionEvent({
      category: 'task',
      title: 'Jose queued approved packet',
      details: { packetId },
      agent: AGENTS.JOSE,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    onJoseStateChange?.('directing', 'Approved packet moved to execution queue.');
    refreshAll();
  };

  const distributeShayanCommand = async () => {
    const command = await createJoseCommandRoute({
      commandText: joseCommandText,
      source: 'shayan',
      zeroCostMode: settings?.zeroCostMode
    });
    if (command) {
      onJoseStateChange?.('directing', `Jose distributed ${command.assignments.length} task${command.assignments.length === 1 ? '' : 's'}.`);
    }
    refreshAll();
  };

  const reportToJose = (packet) => {
    const resultUrl = window.prompt('Optional verified result URL for Jose to report back to Shayan. Leave blank if no URL is verified yet.', '');
    createAgentReportToJose({
      packetId: packet.id,
      reportingAgent: packet.toAgent,
      summary: `${packet.toAgent} reported task status back to Jose for confirmation.`,
      resultState: resultUrl ? 'verified' : 'pending_review',
      resultUrl: resultUrl?.trim() || null
    });
    onJoseStateChange?.('thinking', 'Jose received an agent report.');
    refreshAll();
  };

  const confirmCommand = (commandId) => {
    confirmJoseCommand(commandId);
    onJoseStateChange?.('task_complete', 'Jose confirmed and reported back to Shayan.');
    refreshAll();
  };

  const runRetrySweep = () => {
    const result = runJoseRetrySweep();
    appendSessionEvent({
      category: 'orchestration',
      title: 'Jose retry/dead-letter sweep triggered from workspace',
      details: result,
      agent: AGENTS.JOSE,
      verificationState: TRUST_STATES.PENDING
    });
    onJoseStateChange?.('thinking', 'Jose retry sweep completed.');
    refreshAll();
  };

  const executePacketNow = async (packetId) => {
    const packet = listAgentPackets().find((item) => item.id === packetId);
    if (!packet) {
      refreshAll();
      return;
    }
    setExecutingPacketIds((prev) => new Set(prev).add(packetId));
    const startedAt = Date.now();
    const result = await executeApprovedPacket(packet);
    setExecutingPacketIds((prev) => { const next = new Set(prev); next.delete(packetId); return next; });
    appendSessionEvent({
      category: 'task',
      title: result?.ok ? 'Jose executed approved packet' : 'Jose packet execution failed',
      details: {
        packetId,
        ok: Boolean(result?.ok),
        error: result?.error || null
      },
      agent: AGENTS.JOSE,
      confidence: result?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED,
      verificationState: result?.ok ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
    });
    const summary = result?.ok
      ? (result.setupRequired
        ? `Task queued — no live runtime adapter yet for packet type "${packet.packetType}". Jose marked the packet executed. Check the Receipts panel or chat for follow-up.`
        : (result.executionResult?.note || result.result?.message || `Packet "${packet.title}" executed successfully.`))
      : (result?.error || 'Execution failed — check session events for details.');
    setExecutionResults((prev) => [
      { id: packetId, title: packet.title, packetType: packet.packetType, ok: Boolean(result?.ok), setupRequired: Boolean(result?.setupRequired), summary, ts: startedAt },
      ...prev.slice(0, 9)
    ]);
    onJoseStateChange?.(result?.ok ? 'task_complete' : 'warning', result?.ok ? 'Approved packet executed.' : 'Packet execution failed.');
    refreshAll();
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-4">
      <header className="pb-6 border-b border-white/[0.06]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-4 w-4 text-amber-400/70" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Jose Orchestrator</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Governance &amp; routing</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 max-w-2xl">
              Supervise agent handoffs, review approvals, and route tasks. No automatic execution.
            </p>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            <Metric label="Packets" value={packets.length} />
            <Metric label="Approvals" value={approvalQueue.length} tone={approvalQueue.length ? 'amber' : 'zinc'} />
            <Metric label="Runtime" value={ollamaStatus.label} tone={runtimeState === 'failed' ? 'red' : runtimeState === 'verified' ? 'green' : 'amber'} />
            <button
              type="button"
              onClick={() => setFocusMode((current) => !current)}
              className="rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-200 hover:border-white/[0.12] transition-colors"
            >
              {focusMode ? 'Focus' : 'Full'}
            </button>
          </div>
        </div>
      </header>

      <CollapsiblePanel icon={ClipboardList} title="Jose Task Pipeline" id="jose-task-queue" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
        <JoseTaskQueue onRefresh={refreshAll} />
      </CollapsiblePanel>

      <CollapsiblePanel icon={Crown} title="Jose Command Intake: Shayan -> Jose -> Agents -> Jose -> Shayan" id="jose-intake" focusMode={false} openPanels={openPanels} onToggle={togglePanel}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <textarea
              value={joseCommandText}
              onChange={(event) => setJoseCommandText(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-amber-200/15 bg-zinc-900 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-amber-200/35"
              placeholder="Shayan command to Jose..."
            />
            <button
              onClick={distributeShayanCommand}
              className="rounded-xl bg-amber-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-100"
            >
              Give Command To Jose
            </button>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              This creates real local packets from Jose to the selected agents. It does not execute system commands, silently browse, post messages, upload content, or write files.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Required Workflow</div>
            <div className="mt-3 grid gap-2 text-[11px] text-zinc-300">
              <FlowStep label="1" text="Shayan gives command to Jose." />
              <FlowStep label="2" text="Jose decides which part goes to Hector, Miya, Alphonso, or Jose." />
              <FlowStep label="3" text="Agents report back to Jose." />
              <FlowStep label="4" text="Jose merges agent reports and confirms final command state." />
              <FlowStep label="5" text="Jose reports the result back to Shayan, including a verified URL only when one exists." />
            </div>
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel icon={MessageCircle} title="WhatsApp Inbound" id="whatsapp-inbound" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${whatsappConfigured ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-xs text-zinc-400">{whatsappConfigured ? 'Connector configured — polling active' : 'Connector not configured — set env vars in Settings'}</span>
            </div>
            <button
              onClick={pollWhatsAppNow}
              disabled={!whatsappConfigured || whatsappPolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${whatsappPolling ? 'animate-spin' : ''}`} />
              {whatsappPolling ? 'Polling...' : 'Poll Now'}
            </button>
          </div>

          <WhatsAppInboxPanel
            messages={whatsappAudit.map((e) => ({
              id: e.id || String(Math.random()),
              from: e.details?.from || 'WhatsApp',
              body: e.details?.body || e.action || 'event',
              timestamp: e.timestampMs || Date.now(),
              direction: e.details?.direction || 'inbound',
              status: e.details?.status,
            }))}
            onReply={(_id, _text) => { pollWhatsAppNow(); }}
            onRetry={(_id) => pollWhatsAppNow()}
          />
          {whatsappAudit.length === 0 ? (
            <div className="rounded-xl border border-white/[0.04] bg-zinc-900/40 px-4 py-6 text-center text-xs text-zinc-600">
              No WhatsApp activity yet. Messages routed from WhatsApp will appear here.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {whatsappAudit.map((entry, i) => {
                const isRoute = entry.action?.includes('routed') || entry.action?.includes('distributed');
                const isReject = entry.action?.includes('rejected') || entry.action?.includes('failed') || entry.action?.includes('missing');
                const color = isReject ? 'border-red-500/20 bg-red-900/10' : isRoute ? 'border-emerald-500/20 bg-emerald-900/10' : 'border-white/[0.04] bg-zinc-900/40';
                const dot = isReject ? 'bg-red-400' : isRoute ? 'bg-emerald-400' : 'bg-zinc-500';
                return (
                  <div key={entry.id || i} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${color}`}>
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{entry.action || 'event'}</span>
                        <span className="text-[10px] text-zinc-600">{new Date(entry.timestampMs || 0).toLocaleTimeString()}</span>
                      </div>
                      {entry.details?.packetId && (
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5">Packet: {entry.details.packetId}</div>
                      )}
                      {entry.details?.commandId && (
                        <div className="text-[11px] text-emerald-400 truncate">→ Jose command: {entry.details.commandId}</div>
                      )}
                      {entry.details?.error && (
                        <div className="text-[11px] text-red-400 truncate">{entry.details.error}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {approvalQueue.filter((p) => p.payload?.source === 'whatsapp' || p.fromConnector === 'whatsapp').length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Pending Approval — WhatsApp sourced</div>
              {approvalQueue.filter((p) => p.payload?.source === 'whatsapp' || p.fromConnector === 'whatsapp').map((packet) => (
                <div key={packet.id} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-300 truncate">{packet.title}</span>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { approvePacket(packet.id); refreshAll(); }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-colors">Approve</button>
                    <button onClick={() => { rejectPacket(packet.id, 'Denied from OrchestratorView inbound panel'); refreshAll(); }}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-900/40 text-zinc-300 hover:text-red-300 text-[10px] font-bold transition-colors">Deny</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsiblePanel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CollapsiblePanel icon={Users} title="Agent Workload" id="agent-workload" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="divide-y divide-white/[0.05]">
            {workload.map((row) => (
              <div key={row.agent} className="flex items-center justify-between py-2.5">
                <span className="text-[12px] font-medium capitalize text-zinc-300 w-24">{row.agent}</span>
                <div className="flex items-center gap-4 text-[11px] text-zinc-600">
                  <span>{row.inbound} in</span>
                  <span>{row.outbound} out</span>
                  <span className={row.pending ? 'text-amber-400' : ''}>{row.pending} pending</span>
                  <span className="text-emerald-600">{row.completed} done</span>
                </div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel icon={AlertTriangle} title="Workflow Governance" id="workflow-governance" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-3">
            <GovernanceRow label="Duplicate Task Detection" value={`${duplicateCandidates.length} candidates`} state="verified" />
            <GovernanceRow label="Conflict Detection" value={`${conflictCandidates.length} candidates`} state="verified" />
            <GovernanceRow label="Idle Agent Routing" value={idleAgents.length ? idleAgents.join(', ') : 'No idle agents detected'} state="temporary" />
            <GovernanceRow label="Escalation Queue" value={`${escalations.length} items`} state={escalations.length ? 'pending' : 'verified'} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Duplicate and conflict detection are heuristic UI foundations only. No tasks are merged, canceled, or rerouted automatically.
          </p>
        </CollapsiblePanel>

        <CollapsiblePanel icon={Route} title="Task Routing" id="task-routing" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-3">
            <input
              value={routeTitle}
              onChange={(event) => setRouteTitle(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-200/35"
            />
            <select
              value={routeTarget}
              onChange={(event) => setRouteTarget(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
            >
              <option value={AGENTS.ALPHONSO}>Route to Alphonso execution</option>
              <option value={AGENTS.MIYA}>Route to Miya creative</option>
              <option value={AGENTS.HECTOR}>Route to Hector research</option>
              <option value={AGENTS.MARIA}>Route to Maria governance audit</option>
              <option value={AGENTS.MARCUS}>Route to Marcus distribution execution</option>
              <option value={AGENTS.ECHO}>Route to Echo memory preservation</option>
              <option value={AGENTS.SENTINEL}>Route to Sentinel security monitoring</option>
              <option value={AGENTS.NOVA}>Route to Nova opportunity scoring</option>
            </select>
            <button onClick={createRoutingPacket} className="w-full rounded-xl bg-amber-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-100">
              Create Supervised Route
            </button>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Creates a real local handoff packet in the shared agent bus. It is not executed automatically.
            </p>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel icon={Activity} title="Runtime Balance" id="runtime-balance" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-3 text-sm">
            <RuntimeRow label="Ollama" value={ollamaStatus.label} trust={runtimeState} />
            <RuntimeRow label="Model" value={settings.selectedModel || 'None selected'} trust={settings.selectedModel ? 'temporary' : 'unverified'} />
            <RuntimeRow label="Focus" value={settings.focusMode || 'mission_control'} trust="temporary" />
            <RuntimeRow label="Theme" value={settings.environmentTheme || 'deep_space'} trust="temporary" />
            <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
              Resource points: {resourceSummary.points}. CPU/VRAM readings are limited to WebView-safe browser signals until native telemetry is wired.
            </div>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel icon={RefreshCw} title="Durable Queue + Dead-Letter" id="durable-queue" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-500">
            <MiniStat label="Queued" value={queueSnapshot.queued} />
            <MiniStat label="Failed" value={queueSnapshot.failed} />
            <MiniStat label="Dead" value={queueSnapshot.deadLetter} />
          </div>
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
            {queueTransitions.length === 0 && <p className="text-[11px] text-zinc-500">No queue transitions yet.</p>}
            {queueTransitions.slice(0, 8).map((row) => (
              <div key={row.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-zinc-100">{row.fromStatus} {'->'} {row.toStatus}</span>
                  <TrustBadge state={row.verificationState || 'unverified'} />
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">{row.packetId}</div>
                {row.toStatus === 'dead_letter' && (
                  <button
                    onClick={() => {
                      replayPacketFromDeadLetter(row.packetId, 'Manual replay from Jose workspace.');
                      refreshAll();
                    }}
                    className="mt-2 rounded-lg bg-amber-500/20 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-100"
                  >
                    Replay
                  </button>
                )}
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CollapsiblePanel icon={ShieldCheck} title="Pending Approvals" id="pending-approvals" focusMode={false} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {approvalQueue.length === 0 && <p className="text-sm text-zinc-500">No pending approvals.</p>}
            {approvalQueue.map((packet) => (
              <div key={packet.id} className="rounded-xl border border-amber-200/15 bg-amber-500/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-amber-50">{packet.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-100/55">
                      <AgentAvatar agentId={packet.fromAgent} name={packet.fromAgent} sizeClass="h-4 w-4" className="border-amber-100/20" />
                      <span>{packet.fromAgent}</span>
                      <span>{'->'}</span>
                      <AgentAvatar agentId={packet.toAgent} name={packet.toAgent} sizeClass="h-4 w-4" className="border-amber-100/20" />
                      <span>{packet.toAgent}</span>
                      <span>| {packet.packetType}</span>
                    </div>
                  </div>
                  <TrustBadge state={packet.verificationState || 'unverified'} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => approve(packet.id)} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100">Approve</button>
                  <button onClick={() => reject(packet.id)} className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-100">Reject</button>
                  <button onClick={() => queueForExecution(packet.id)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Queue</button>
                  <button
                    onClick={() => executePacketNow(packet.id)}
                    disabled={executingPacketIds.has(packet.id)}
                    className="rounded-lg bg-indigo-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-100 disabled:opacity-50 disabled:cursor-wait"
                  >
                    {executingPacketIds.has(packet.id) ? 'Running…' : 'Execute'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel icon={GitBranch} title="Active Workflows" id="active-workflows" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {workflows.length === 0 && <p className="text-sm text-zinc-500">No workflows created yet.</p>}
            {workflows.map((flow) => (
              <div key={flow.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{flow.name}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{flow.agentScope} | nodes {flow.nodes.length} | edges {flow.edges.length}</div>
                  </div>
                  <TrustBadge state={flow.verificationState || 'unverified'} />
                </div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CollapsiblePanel icon={Brain} title="Memory Governance" id="memory-governance" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label="Shared Memory" value={memoryItems.length} />
            <Metric label="Miya Memory" value={miyaMemory.length} tone="fuchsia" />
            <Metric label="Expired" value={memoryItems.filter((item) => item.confidence === TRUST_STATES.EXPIRED).length} tone="amber" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Memory items are local records with confidence, source, timestamp, and verification state. Jose currently governs visibility and queue state; semantic deduplication is still backend work.
          </p>
        </CollapsiblePanel>

        <CollapsiblePanel icon={ClipboardList} title="System Decisions" id="system-decisions" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="flex gap-2">
            <button onClick={recordDecision} className="rounded-xl bg-amber-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-100">
              Record Governance Snapshot
            </button>
            <button onClick={refreshAll} className="rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
              <RefreshCw className="inline h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
            {decisions.length === 0 && <p className="text-sm text-zinc-500">No Jose governance decisions recorded yet.</p>}
            {decisions.slice().reverse().map((decision) => (
              <div key={decision.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{decision.title}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{decision.summary}</div>
                  </div>
                  <TrustBadge state={decision.verificationState} />
                </div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CollapsiblePanel icon={Gauge} title="Orchestration Analytics" id="orchestration-analytics" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 text-sm">
            <RuntimeRow label="Packets Created" value={packets.length} trust="temporary" />
            <RuntimeRow label="Approval Rate" value={formatPercent(countStatus(packets, 'approved'), packets.length)} trust="inferred" />
            <RuntimeRow label="Execution Reports" value={countStatus(packets, 'executed')} trust="temporary" />
            <RuntimeRow label="Rejected Packets" value={countStatus(packets, 'rejected')} trust={countStatus(packets, 'rejected') ? 'pending' : 'verified'} />
            <RuntimeRow label="Failed Packets" value={workflowObs?.totals?.failedPackets ?? 0} trust={workflowObs?.totals?.failedPackets ? 'pending' : 'verified'} />
            <RuntimeRow label="Dead Letters" value={workflowObs?.totals?.deadLetters ?? 0} trust={workflowObs?.totals?.deadLetters ? 'failed' : 'verified'} />
          </div>
          <button onClick={runRetrySweep} className="mt-3 w-full rounded-xl bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">
            Run Retry + Dead-Letter Sweep
          </button>
        </CollapsiblePanel>

        <CollapsiblePanel icon={Network} title="Active Handoffs" id="active-handoffs" focusMode={false} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {packets.filter((packet) => ['pending_approval', 'approved', 'queued'].includes(packet.status)).length === 0 && <p className="text-sm text-zinc-500">No active handoffs.</p>}
            {packets.filter((packet) => ['pending_approval', 'approved', 'queued'].includes(packet.status)).slice().reverse().slice(0, 8).map((packet) => (
              <div key={packet.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
                <div className="text-sm font-semibold text-zinc-100">{packet.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                  <span>{packet.status} |</span>
                  <AgentAvatar agentId={packet.fromAgent} name={packet.fromAgent} sizeClass="h-4 w-4" />
                  <span>{packet.fromAgent}</span>
                  <span>{'->'}</span>
                  <AgentAvatar agentId={packet.toAgent} name={packet.toAgent} sizeClass="h-4 w-4" />
                  <span>{packet.toAgent}</span>
                </div>
                {packet.fromAgent === AGENTS.JOSE && packet.toAgent !== AGENTS.JOSE && (
                  <button onClick={() => reportToJose(packet)} className="mt-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-100">
                    Agent Report Back To Jose
                  </button>
                )}
                {['approved', 'queued'].includes(packet.status) && (
                  <button
                    onClick={() => executePacketNow(packet.id)}
                    disabled={executingPacketIds.has(packet.id)}
                    className="mt-2 ml-2 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-100 disabled:opacity-50 disabled:cursor-wait"
                  >
                    {executingPacketIds.has(packet.id) ? 'Running…' : 'Execute Now'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel icon={ShieldCheck} title="Approval Governance" id="approval-governance" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 text-sm">
            <RuntimeRow label="Visible Approval Queue" value={`${approvalQueue.length} pending`} trust={approvalQueue.length ? 'pending' : 'verified'} />
            <RuntimeRow label="High Risk Items" value={packets.filter((packet) => ['high', 'critical'].includes(packet.riskLevel || '')).length} trust="temporary" />
            <RuntimeRow label="Rollback Wiring" value="Planned but not execution-backed yet" trust="unverified" />
            <RuntimeRow label="Dangerous Auto-Execution" value="Disabled" trust="verified" />
          </div>
        </CollapsiblePanel>
      </div>

      <CollapsiblePanel icon={Database} title="Handoff Queue + Timeline" id="handoff-timeline" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {packets.slice().reverse().slice(0, 12).map((packet) => (
              <div key={packet.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
                <div className="font-semibold text-zinc-100">{packet.title}</div>
                <div className="mt-1">{packet.status} | {packet.fromAgent} {'->'} {packet.toAgent}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {sessionEvents.slice().reverse().slice(0, 12).map((event) => (
              <div key={event.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
                <div className="font-semibold text-zinc-100">{event.title}</div>
                <div className="mt-1">{event.category} | {new Date(event.timestampMs).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      </CollapsiblePanel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CollapsiblePanel icon={AlertTriangle} title="Dead-Letter Queue" id="dead-letter-queue" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {deadLetters.length === 0 && <p className="text-sm text-zinc-500">No dead-letter items.</p>}
            {deadLetters.slice().reverse().slice(0, 12).map((item) => (
              <div key={`${item.commandId}-${item.packetId}`} className="rounded-xl border border-red-300/15 bg-red-500/10 p-3 text-[11px] text-red-100/85">
                <div className="font-semibold">{item.agent}: {item.title}</div>
                <div className="mt-1 text-red-100/70">Command: {item.commandText}</div>
                <div className="mt-1">Retries: {item.retries || 0}</div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel icon={ClipboardList} title="Jose Receipts" id="jose-receipts" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {(workflowObs?.receipts || []).length === 0 && <p className="text-sm text-zinc-500">No orchestration receipts yet.</p>}
            {(workflowObs?.receipts || []).slice(0, 20).map((receipt) => (
              <div key={receipt.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
                <div className="font-semibold">{receipt.type}</div>
                <div className="mt-1 text-zinc-500">Command {receipt.commandId} | {new Date(receipt.timestampMs).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      </div>

      <CollapsiblePanel icon={Route} title="Orchestration Queue" id="orchestration-queue" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
        <OrchestratorQueueView />
      </CollapsiblePanel>

      <CollapsiblePanel icon={ClipboardList} title="Jose Command Ledger" id="jose-command-ledger" focusMode={focusMode} openPanels={openPanels} onToggle={togglePanel}>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {joseCommands.length === 0 && <p className="text-sm text-zinc-500">No Shayan {'->'} Jose commands recorded yet.</p>}
          {joseCommands.slice().reverse().slice(0, 10).map((command) => (
            <div key={command.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{command.commandText}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{command.status} | assignments {command.assignments?.length || 0}</div>
                </div>
                <TrustBadge state={command.trust} />
              </div>
                <div className="mt-3 grid gap-2">
                  {(command.assignments || []).map((assignment) => (
                    <div key={assignment.packetId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-zinc-400">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AgentAvatar agentId="jose" name="Jose" sizeClass="h-4 w-4" />
                        <span>Jose {'->'}</span>
                        <AgentAvatar agentId={assignment.agent} name={assignment.agent} sizeClass="h-4 w-4" />
                        <span className="capitalize">{assignment.agent}</span>
                        <span>: {assignment.title} | {assignment.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              <button onClick={() => confirmCommand(command.id)} className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100">
                Jose Confirm + Report To Shayan
              </button>
              {command.joseConfirmation && <div className="mt-2 text-[11px] text-emerald-200/80">{command.joseConfirmation}</div>}
              {command.shayanReport && (
                <div className="mt-3 rounded-lg border border-emerald-300/15 bg-emerald-500/10 p-3 text-[11px] text-emerald-100/85">
                  <div className="font-bold uppercase tracking-widest">Jose {'->'} Shayan Report</div>
                  <div className="mt-2">{command.shayanReport.summary}</div>
                  {command.shayanReport.resultUrl ? (
                    <div className="mt-2 break-all text-emerald-200">Verified URL: {command.shayanReport.resultUrl}</div>
                  ) : (
                    <div className="mt-2 text-amber-100/85">No verified result URL yet.</div>
                  )}
                  <div className="mt-2 text-emerald-100/60">
                    Reports merged: {command.shayanReport.reportCount} | Pending: {command.shayanReport.pendingCount}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsiblePanel>

      {executionResults.length > 0 && (
        <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Execution Results</div>
            <button onClick={() => setExecutionResults([])} className="text-[10px] text-zinc-500 hover:text-zinc-300">Clear</button>
          </div>
          {executionResults.map((r) => (
            <div key={r.id + r.ts} className={`rounded-xl border p-3 ${r.ok ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-red-400/20 bg-red-500/10'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${r.ok ? 'text-emerald-200' : 'text-red-300'}`}>{r.ok ? (r.setupRequired ? '⏳ Queued' : '✓ Success') : '✗ Failed'}</span>
                <span className="text-[10px] text-zinc-500">{new Date(r.ts).toLocaleTimeString()}</span>
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-100">{r.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">{r.summary}</div>
              {r.setupRequired && (
                <div className="mt-2 text-[11px] text-amber-300/80">
                  This packet type (<code className="text-amber-200">{r.packetType}</code>) needs a runtime adapter to produce live output. Go to <strong>Chat</strong> and ask Alphonso to execute the task directly — that path is fully wired.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

function Panel({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-5">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-amber-400/70" />
        {title}
      </div>
      {children}
    </section>
  );
}

function CollapsiblePanel({ icon: Icon, title, id, focusMode, openPanels, onToggle, children }) {
  const open = !focusMode || openPanels.has(id);
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/40">
      <button
        type="button"
        onClick={() => onToggle?.(id)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <Icon className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
          {title}
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
      </button>
      {open && <div className="border-t border-white/[0.06] px-5 py-4">{children}</div>}
    </section>
  );
}

function Metric({ label, value, tone = 'zinc' }) {
  const valueColor = tone === 'green' ? 'text-emerald-300' : tone === 'red' ? 'text-red-300' : tone === 'amber' ? 'text-amber-300' : tone === 'fuchsia' ? 'text-fuchsia-300' : 'text-zinc-100';
  return (
    <div>
      <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest">{label}</div>
      <div className={`mt-0.5 text-lg font-bold truncate ${valueColor}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-base font-bold text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{label}</div>
    </div>
  );
}

function RuntimeRow({ label, value, trust }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[12px] font-medium text-zinc-200">{value}</span>
        <TrustBadge state={trust} />
      </div>
    </div>
  );
}

function TrustBadge({ state }) {
  const color = state === 'verified'
    ? 'text-emerald-400'
    : state === 'failed'
      ? 'text-red-400'
      : state === 'temporary' || state === 'pending'
        ? 'text-amber-400'
        : 'text-zinc-600';
  return <span className={`text-[10px] font-semibold ${color}`}>{state || 'unverified'}</span>;
}

function GovernanceRow({ label, value, state }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.05] last:border-0">
      <div>
        <div className="text-[12px] font-medium text-zinc-300">{label}</div>
        <div className="text-[11px] text-zinc-600 mt-0.5">{value}</div>
      </div>
      <TrustBadge state={state} />
    </div>
  );
}

function FlowStep({ label, text }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-300">{label}</span>
      <span className="text-[12px] text-zinc-400">{text}</span>
    </div>
  );
}

function findDuplicateCandidates(packets) {
  const seen = new Set();
  const duplicates = [];
  packets.forEach((packet) => {
    const key = `${packet.title || ''}:${packet.toAgent || ''}`.toLowerCase();
    if (seen.has(key)) duplicates.push(packet);
    seen.add(key);
  });
  return duplicates;
}

function findConflictCandidates(packets) {
  return packets.filter((packet) => packet.status === 'pending_approval' && ['high', 'critical'].includes(packet.riskLevel || ''));
}

function countStatus(packets, status) {
  return packets.filter((packet) => packet.status === status).length;
}

function formatPercent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}
