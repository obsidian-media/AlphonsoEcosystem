import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

  const [orchTab, setOrchTab] = useState('command');
  const orchTabs = [
    { id: 'command', label: 'Command' },
    { id: 'approvals', label: `Approvals${approvalQueue.length ? ` (${approvalQueue.length})` : ''}` },
    { id: 'packets', label: 'Packets' },
    { id: 'monitor', label: 'Monitor' },
  ];

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-5">

      {/* Header */}
      <header className="pb-5 border-b border-white/[0.06]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/70">
              <Crown className="h-3.5 w-3.5" />
              Orchestrator
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Jose — Governance &amp; Routing</h1>
            <p className="mt-1 text-[13px] text-zinc-500">Supervise agent handoffs, review approvals, route tasks. No automatic execution.</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Packets</div>
              <div className="text-lg font-bold text-zinc-100">{packets.length}</div>
            </div>
            {approvalQueue.length > 0 && (
              <div className="text-right">
                <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Pending</div>
                <div className="text-lg font-bold text-amber-300">{approvalQueue.length}</div>
              </div>
            )}
            <button
              type="button"
              onClick={refreshAll}
              className="rounded-lg border border-white/[0.08] bg-zinc-900/60 p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1">
        {orchTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setOrchTab(tab.id)}
            className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              orchTab === tab.id
                ? 'bg-amber-500/10 text-amber-200 border border-amber-400/20'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
      <motion.div
        key={orchTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
      >

      {/* Command Tab */}
      {orchTab === 'command' && (
        <div className="space-y-4">
          <OCard label="Jose Task Pipeline">
            <JoseTaskQueue onRefresh={refreshAll} />
          </OCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <OCard label="Give Command to Jose">
              <div className="space-y-3">
                <textarea
                  value={joseCommandText}
                  onChange={(e) => setJoseCommandText(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 outline-none focus:border-amber-200/30 placeholder:text-zinc-600"
                  placeholder="Describe what you want Jose to coordinate…"
                />
                <button
                  onClick={distributeShayanCommand}
                  className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 hover:bg-amber-500/15 transition-colors"
                >
                  Send to Jose
                </button>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Creates local packets from Jose to selected agents. No system commands, browsing, or file writes.
                </p>
              </div>
            </OCard>
            <OCard label="Workflow">
              <div className="space-y-2">
                {[
                  ['1', 'You give a command to Jose.'],
                  ['2', 'Jose routes parts to Hector, Miya, Alphonso, or others.'],
                  ['3', 'Agents report back to Jose.'],
                  ['4', 'Jose merges reports and confirms.'],
                  ['5', 'Jose reports result back to you with a verified URL when available.'],
                ].map(([n, text]) => (
                  <FlowStep key={n} label={n} text={text} />
                ))}
              </div>
            </OCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <OCard label="Task Routing">
              <div className="space-y-3">
                <input
                  value={routeTitle}
                  onChange={(e) => setRouteTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber-200/30"
                />
                <select
                  value={routeTarget}
                  onChange={(e) => setRouteTarget(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                >
                  <option value={AGENTS.ALPHONSO}>Alphonso — execution</option>
                  <option value={AGENTS.MIYA}>Miya — creative</option>
                  <option value={AGENTS.HECTOR}>Hector — research</option>
                  <option value={AGENTS.MARIA}>Maria — governance audit</option>
                  <option value={AGENTS.MARCUS}>Marcus — distribution</option>
                  <option value={AGENTS.ECHO}>Echo — memory</option>
                  <option value={AGENTS.SENTINEL}>Sentinel — security</option>
                  <option value={AGENTS.NOVA}>Nova — opportunity</option>
                </select>
                <button onClick={createRoutingPacket} className="w-full rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 hover:bg-amber-500/15 transition-colors">
                  Create Supervised Route
                </button>
              </div>
            </OCard>

            <OCard label="WhatsApp Inbound">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full ${whatsappConfigured ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className="text-[12px] text-zinc-400">{whatsappConfigured ? 'Connected' : 'Not configured — see Settings'}</span>
                  </div>
                  <button
                    onClick={pollWhatsAppNow}
                    disabled={!whatsappConfigured || whatsappPolling}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-900/60 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-colors"
                  >
                    <RefreshCw className={`h-3 w-3 ${whatsappPolling ? 'animate-spin' : ''}`} />
                    {whatsappPolling ? 'Polling…' : 'Poll'}
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
                  onReply={() => pollWhatsAppNow()}
                  onRetry={() => pollWhatsAppNow()}
                />
              </div>
            </OCard>
          </div>
        </div>
      )}

      {/* Approvals Tab */}
      {orchTab === 'approvals' && (
        <div className="space-y-4">
          {approvalQueue.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-10 text-center">
              <p className="text-sm text-zinc-500">No pending approvals.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {approvalQueue.map((packet) => (
                <div key={packet.id} className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-100">{packet.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                        <AgentAvatar agentId={packet.fromAgent} name={packet.fromAgent} sizeClass="h-3.5 w-3.5" />
                        <span>{packet.fromAgent}</span>
                        <span>→</span>
                        <AgentAvatar agentId={packet.toAgent} name={packet.toAgent} sizeClass="h-3.5 w-3.5" />
                        <span>{packet.toAgent}</span>
                        <span>· {packet.packetType}</span>
                      </div>
                    </div>
                    <TrustBadge state={packet.verificationState || 'unverified'} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <ApproveBtn onClick={() => approve(packet.id)}>Approve</ApproveBtn>
                    <RejectBtn onClick={() => reject(packet.id)}>Reject</RejectBtn>
                    <NeutralBtn onClick={() => queueForExecution(packet.id)}>Queue</NeutralBtn>
                    <NeutralBtn
                      onClick={() => executePacketNow(packet.id)}
                      disabled={executingPacketIds.has(packet.id)}
                    >
                      {executingPacketIds.has(packet.id) ? 'Running…' : 'Execute'}
                    </NeutralBtn>
                  </div>
                </div>
              ))}
            </div>
          )}

          {executionResults.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] bg-zinc-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Execution Results</div>
                <button onClick={() => setExecutionResults([])} className="text-[10px] text-zinc-600 hover:text-zinc-400">Clear</button>
              </div>
              {executionResults.map((r) => (
                <div key={r.id + r.ts} className={`rounded-xl border p-3 ${r.ok ? 'border-emerald-400/15 bg-emerald-500/5' : 'border-red-400/15 bg-red-500/5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                      {r.ok ? (r.setupRequired ? 'Queued' : 'Success') : 'Failed'}
                    </span>
                    <span className="text-[10px] text-zinc-600">{new Date(r.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-1 text-[12px] font-medium text-zinc-200">{r.title}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500 leading-relaxed">{r.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packets Tab */}
      {orchTab === 'packets' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <OCard label="Active Handoffs">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {packets.filter((p) => ['pending_approval', 'approved', 'queued'].includes(p.status)).length === 0
                  ? <p className="text-[12px] text-zinc-600">No active handoffs.</p>
                  : packets.filter((p) => ['pending_approval', 'approved', 'queued'].includes(p.status)).slice().reverse().slice(0, 8).map((packet) => (
                    <div key={packet.id} className="rounded-xl border border-white/[0.07] bg-zinc-900/40 p-3">
                      <div className="text-[12px] font-medium text-zinc-200">{packet.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5">{packet.status}</span>
                        <span>{packet.fromAgent} → {packet.toAgent}</span>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {packet.fromAgent === AGENTS.JOSE && packet.toAgent !== AGENTS.JOSE && (
                          <NeutralBtn onClick={() => reportToJose(packet)}>Report to Jose</NeutralBtn>
                        )}
                        {['approved', 'queued'].includes(packet.status) && (
                          <NeutralBtn onClick={() => executePacketNow(packet.id)} disabled={executingPacketIds.has(packet.id)}>
                            {executingPacketIds.has(packet.id) ? 'Running…' : 'Execute'}
                          </NeutralBtn>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </OCard>

            <OCard label="Jose Command Ledger">
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {joseCommands.length === 0 && <p className="text-[12px] text-zinc-600">No commands recorded yet.</p>}
                {joseCommands.slice().reverse().slice(0, 8).map((command) => (
                  <div key={command.id} className="rounded-xl border border-white/[0.07] bg-zinc-900/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12px] font-medium text-zinc-200 line-clamp-2">{command.commandText}</div>
                      <TrustBadge state={command.trust} />
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">{command.status} · {command.assignments?.length || 0} assignments</div>
                    <div className="mt-2 flex gap-1.5">
                      <NeutralBtn onClick={() => confirmCommand(command.id)}>Confirm &amp; Report</NeutralBtn>
                    </div>
                    {command.shayanReport && (
                      <div className="mt-2 rounded-lg border border-emerald-400/15 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-200/80">
                        {command.shayanReport.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </OCard>
          </div>

          <OCard label="All Packets (recent)">
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {packets.slice().reverse().slice(0, 12).map((packet) => (
                <div key={packet.id} className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-400">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-200 truncate">{packet.title}</span>
                    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px]">{packet.status}</span>
                  </div>
                  <div className="mt-0.5 text-zinc-600">{packet.fromAgent} → {packet.toAgent}</div>
                </div>
              ))}
            </div>
          </OCard>

          <OCard label="Queue View">
            <OrchestratorQueueView />
          </OCard>
        </div>
      )}

      {/* Monitor Tab — keep same */}
      {orchTab === 'monitor' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <OCard label="Agent Workload">
              <div className="divide-y divide-white/[0.05]">
                {workload.map((row) => (
                  <div key={row.agent} className="flex items-center justify-between py-2">
                    <span className="text-[12px] font-medium capitalize text-zinc-300">{row.agent}</span>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                      <span>{row.inbound} in</span>
                      <span>{row.outbound} out</span>
                      <span className={row.pending ? 'text-amber-400' : ''}>{row.pending} pend</span>
                      <span className="text-emerald-600">{row.completed} done</span>
                    </div>
                  </div>
                ))}
              </div>
            </OCard>

            <OCard label="Durable Queue">
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <MiniStat label="Queued" value={queueSnapshot.queued} />
                <MiniStat label="Failed" value={queueSnapshot.failed} />
                <MiniStat label="Dead" value={queueSnapshot.deadLetter} />
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {queueTransitions.slice(0, 6).map((row) => (
                  <div key={row.id} className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-300">{row.fromStatus} → {row.toStatus}</span>
                      <TrustBadge state={row.verificationState || 'unverified'} />
                    </div>
                    {row.toStatus === 'dead_letter' && (
                      <button
                        onClick={() => { replayPacketFromDeadLetter(row.packetId, 'Manual replay.'); refreshAll(); }}
                        className="mt-1.5 rounded border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                      >
                        Replay
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </OCard>

            <OCard label="Governance">
              <div className="space-y-2">
                <GovernanceRow label="Duplicates" value={`${duplicateCandidates.length} candidates`} state="verified" />
                <GovernanceRow label="Conflicts" value={`${conflictCandidates.length} high-risk`} state="verified" />
                <GovernanceRow label="Idle agents" value={idleAgents.length ? idleAgents.join(', ') : 'None'} state="temporary" />
                <GovernanceRow label="Escalations" value={`${escalations.length} items`} state={escalations.length ? 'pending' : 'verified'} />
              </div>
            </OCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <OCard label="Analytics">
              <div className="space-y-0.5">
                <RuntimeRow label="Total Packets" value={packets.length} trust="temporary" />
                <RuntimeRow label="Approval Rate" value={formatPercent(countStatus(packets, 'approved'), packets.length)} trust="inferred" />
                <RuntimeRow label="Executed" value={countStatus(packets, 'executed')} trust="temporary" />
                <RuntimeRow label="Rejected" value={countStatus(packets, 'rejected')} trust={countStatus(packets, 'rejected') ? 'pending' : 'verified'} />
                <RuntimeRow label="Dead Letters" value={workflowObs?.totals?.deadLetters ?? 0} trust={workflowObs?.totals?.deadLetters ? 'failed' : 'verified'} />
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={runRetrySweep} className="rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 py-2 text-[10px] font-semibold tracking-wider text-zinc-400 hover:text-zinc-200 transition-colors">
                  Retry Sweep
                </button>
                <button onClick={recordDecision} className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold tracking-wider text-amber-300 hover:bg-amber-500/15 transition-colors">
                  Record Snapshot
                </button>
              </div>
            </OCard>

            <OCard label="Memory">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <MiniStat label="Shared" value={memoryItems.length} />
                <MiniStat label="Miya" value={miyaMemory.length} />
                <MiniStat label="Workflows" value={workflows.length} />
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {sessionEvents.slice().reverse().slice(0, 6).map((event) => (
                  <div key={event.id} className="rounded-lg border border-white/[0.05] bg-zinc-900/30 px-3 py-2 text-[11px] text-zinc-400">
                    <div className="font-medium text-zinc-300">{event.title}</div>
                    <div className="mt-0.5 text-zinc-600">{event.category} · {new Date(event.timestampMs).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            </OCard>
          </div>

          <OCard label="Dead-Letter Items">
            {deadLetters.length === 0
              ? <p className="text-[12px] text-zinc-600">No dead-letter items.</p>
              : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {deadLetters.slice().reverse().slice(0, 8).map((item) => (
                    <div key={`${item.commandId}-${item.packetId}`} className="rounded-xl border border-red-400/15 bg-red-500/5 p-3 text-[11px] text-red-200/80">
                      <div className="font-medium">{item.agent}: {item.title}</div>
                      <div className="mt-0.5 text-red-300/60">{item.commandText}</div>
                      <div className="mt-0.5 text-zinc-500">Retries: {item.retries || 0}</div>
                    </div>
                  ))}
                </div>
              )}
          </OCard>
        </div>
      )}
      </motion.div>
      </AnimatePresence>
      </div>
    </div>
  );
}

function OCard({ label, children }) {
  return (
    <div className="card">
      {label && <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)]">{label}</div>}
      {children}
    </div>
  );
}

function ApproveBtn({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-[var(--success)]/25 bg-[var(--success)]/10 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-emerald-300 hover:bg-[var(--success)]/15 transition-colors">
      {children}
    </button>
  );
}

function RejectBtn({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-[var(--error)]/25 bg-[var(--error)]/10 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-red-300 hover:bg-[var(--error)]/15 transition-colors">
      {children}
    </button>
  );
}

function NeutralBtn({ onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-secondary text-[10px] px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
      {children}
    </button>
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
