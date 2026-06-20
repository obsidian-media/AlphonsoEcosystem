import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  FileSearch,
  GitBranch,
  HardDrive,
  Mic,
  Network,
  RefreshCw,
  Route,
  ShieldCheck,
  UploadCloud,
  Users
} from 'lucide-react';
import {
  approvePacket,
  listAgentPackets,
  listPacketsByStatus,
  rejectPacket
} from '../services/agentBusService';
import { listMemoryItems } from '../services/memoryService';
import {
  getDurableMemoryStatus,
  getLastMemoryMigration,
  listDurableMemoryRecords,
  migrateLocalStorageMemoryToSqlite
} from '../services/durableMemoryService';
import { listMiyaMemory } from '../services/miyaMemoryService';
import { listSessionEvents, summarizeSession } from '../services/sessionIntelligenceService';
import { listWorkflows } from '../services/workflowBuilderService';
import { trustColor, TRUST_STATES } from '../services/trustModel';
import { listWorkflowOperations, updateWorkflowOperationStatus } from '../services/workflowOperationsRegistryService';
import { listOrchestrationReceipts } from '../services/orchestrationReceiptService';
import { AgentAvatar } from './AgentAvatar';

const riskColors = {
  low: 'green',
  medium: 'amber',
  high: 'red',
  critical: 'red'
};

const agentTone = {
  jose: 'amber',
  alphonso: 'blue',
  miya: 'fuchsia',
  hector: 'teal',
  maria: 'amber',
  marcus: 'blue',
  echo: 'indigo',
  sentinel: 'teal',
  nova: 'blue',
  shared: 'indigo'
};

export function TrustLayerPanel({ verificationLogs = [], ollamaStatus }) {
  const [filter, setFilter] = useState('all');
  const [orchestrationReceipts, setOrchestrationReceipts] = useState(() => listOrchestrationReceipts().slice(0, 120));
  const mergedRows = useMemo(() => {
    const mapped = orchestrationReceipts.map((item) => ({
      id: item.id,
      type: `orchestration:${item.eventType}`,
      command: item.actionType || item.eventType,
      result: item.status,
      trust: item.verificationState || item.confidence || TRUST_STATES.UNVERIFIED,
      payload: {
        packetId: item.packetId,
        commandId: item.commandId,
        connectorId: item.connectorId,
        riskLevel: item.riskLevel,
        command: item.actionType || item.eventType
      },
      timestampMs: item.timestampMs,
      source: item.agent,
      state: item.status
    }));
    return [...verificationLogs, ...mapped].sort((a, b) => Number(b.timestampMs || 0) - Number(a.timestampMs || 0));
  }, [verificationLogs, orchestrationReceipts]);
  const logs = useMemo(() => {
    const rows = [...mergedRows];
    return filter === 'all' ? rows : rows.filter((row) => row.type === filter);
  }, [filter, mergedRows]);
  const logTypes = useMemo(() => ['all', ...new Set(mergedRows.map((row) => row.type).filter(Boolean))], [mergedRows]);

  useEffect(() => {
    const handler = () => setOrchestrationReceipts(listOrchestrationReceipts().slice(0, 120));
    window.addEventListener('alphonso:ledger_hydrated', handler);
    return () => window.removeEventListener('alphonso:ledger_hydrated', handler);
  }, []);

  return (
    <Panel icon={ShieldCheck} title="Trust / Verification Layer" tone="cyan">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <ProofTile icon={Activity} label="Runtime" value={ollamaStatus?.label || 'Unknown'} trust={ollamaStatus?.trust || TRUST_STATES.UNVERIFIED} />
        <ProofTile icon={HardDrive} label="Filesystem Proof" value={countType(verificationLogs, 'filesystem_proof')} trust={trustForType(verificationLogs, 'filesystem_proof')} />
        <ProofTile icon={Network} label="Process Proof" value={countType(verificationLogs, 'process_proof')} trust={trustForType(verificationLogs, 'process_proof')} />
        <ProofTile icon={ClipboardList} label="Action Receipts" value={mergedRows.length} trust={mergedRows.length ? TRUST_STATES.TEMPORARY : TRUST_STATES.UNVERIFIED} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {logTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              filter === type ? 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100' : 'border-white/10 bg-zinc-900/60 text-zinc-400'
            }`}
          >
            {type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
        {logs.length === 0 && <EmptyState label="No verification receipts recorded yet." />}
        {logs.slice(0, 14).map((log) => (
          <ActionReceipt key={log.id} log={log} />
        ))}
      </div>
    </Panel>
  );
}

export function ApprovalCenterPanel({ onRefresh }) {
  const [packets, setPackets] = useState(() => listAgentPackets());
  const [statusFilter, setStatusFilter] = useState('pending_approval');
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return packets;
    return packets.filter((packet) => packet.status === statusFilter);
  }, [packets, statusFilter]);

  const refresh = () => {
    setPackets(listAgentPackets());
    onRefresh?.();
  };

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('alphonso:ledger_hydrated', handler);
    return () => window.removeEventListener('alphonso:ledger_hydrated', handler);
  }, []);

  const approve = (packetId) => {
    approvePacket(packetId, 'approval-center');
    refresh();
  };

  const reject = (packetId) => {
    rejectPacket(packetId, 'Rejected from Approval Center.');
    refresh();
  };

  return (
    <Panel icon={CheckCircle2} title="Approval Center" tone="amber">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Pending" value={listPacketsByStatus('pending_approval').length} tone="amber" />
        <Metric label="Approved" value={listPacketsByStatus('approved').length} tone="green" />
        <Metric label="Rejected" value={listPacketsByStatus('rejected').length} tone="red" />
        <Metric label="Queued" value={listPacketsByStatus('queued').length} tone="blue" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {['pending_approval', 'approved', 'rejected', 'queued', 'executed', 'all'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              statusFilter === status ? 'border-amber-300/30 bg-amber-500/15 text-amber-100' : 'border-white/10 bg-zinc-900/60 text-zinc-400'
            }`}
          >
            {status.replace(/_/g, ' ')}
          </button>
        ))}
        <button onClick={refresh} className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
          <RefreshCw className="inline h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
        {filtered.length === 0 && <EmptyState label="No approvals in this state." />}
        {filtered.slice().reverse().slice(0, 16).map((packet) => (
          <ApprovalCard key={packet.id} packet={packet} onApprove={approve} onReject={reject} />
        ))}
      </div>
    </Panel>
  );
}

export function MemoryConfidencePanel() {
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [durableStatus, setDurableStatus] = useState(null);
  const [durableRows, setDurableRows] = useState([]);
  const [migrationProof, setMigrationProof] = useState(() => getLastMemoryMigration());
  const [migrationError, setMigrationError] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  const refreshDurableMemory = async () => {
    const [status, records] = await Promise.all([
      getDurableMemoryStatus(),
      listDurableMemoryRecords()
    ]);
    setDurableStatus(status);
    setDurableRows(Array.isArray(records) ? records : []);
  };

  useEffect(() => {
    refreshDurableMemory();
  }, []);

  const migrateMemory = async () => {
    setMigrationError('');
    setIsMigrating(true);
    try {
      const proof = await migrateLocalStorageMemoryToSqlite();
      setMigrationProof(proof);
      await refreshDurableMemory();
    } catch (error) {
      setMigrationError(String(error));
    } finally {
      setIsMigrating(false);
    }
  };

  const shared = listMemoryItems().map((item) => ({ ...item, agent: inferAgent(item.source), scope: 'shared-localStorage' }));
  const miya = listMiyaMemory().map((item) => ({ ...item, agent: 'miya', scope: 'creative-localStorage' }));
  const localRows = [...shared, ...miya].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  const sqliteRows = durableRows.map((item) => ({ ...item, agent: item.sourceAgent || inferAgent(item.source), scope: 'sqlite' }));
  const rows = (sqliteRows.length ? sqliteRows : localRows).sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  const categories = ['all', ...new Set(rows.map((row) => row.category).filter(Boolean))];
  const filtered = rows.filter((row) => {
    const confidenceOk = confidenceFilter === 'all' || row.confidence === confidenceFilter || row.verificationState === confidenceFilter;
    const categoryOk = categoryFilter === 'all' || row.category === categoryFilter;
    const agentOk = agentFilter === 'all' || row.agent === agentFilter;
    const projectOk = !projectFilter.trim() || JSON.stringify(row).toLowerCase().includes(projectFilter.trim().toLowerCase());
    const dateOk = dateFilter === 'all' || isWithinDateFilter(row.timestampMs, dateFilter);
    return confidenceOk && categoryOk && agentOk && projectOk && dateOk;
  });

  return (
    <Panel icon={Brain} title="Memory Confidence System" tone="indigo">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          {['all', 'verified', 'inferred', 'temporary', 'expired', 'unverified', 'user_confirmed'].map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          {categories.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          {['all', 'jose', 'alphonso', 'miya', 'hector', 'maria', 'marcus', 'echo', 'sentinel', 'nova', 'shared'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          <option value="all">all dates</option>
          <option value="today">today</option>
          <option value="7d">last 7 days</option>
          <option value="30d">last 30 days</option>
        </select>
        <input value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} placeholder="Filter by project/source text" className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </div>
      <div className="mt-3 rounded-xl border border-indigo-300/15 bg-indigo-500/10 p-3 text-[11px] text-indigo-100/75">
        SQLite durable memory is now the preferred store in the Tauri app. If SQLite is unavailable in browser preview, this panel falls back to localStorage. Semantic/vector memory remains setup_required.
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-200">
            <Database className="h-3.5 w-3.5" />
            Durable Memory Store
          </div>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <div>Status: {durableStatus?.available ? 'SQLite available' : 'SQLite unavailable / preview fallback'}</div>
            <div>Records: {durableStatus?.recordCount ?? durableRows.length}</div>
            <div>Expired: {durableStatus?.expiredCount ?? 0}</div>
            <div>Path: <span className="text-zinc-500">{durableStatus?.path || 'not available'}</span></div>
          </div>
          {migrationProof && <div className="mt-2 text-indigo-100/80">Last migration: requested {migrationProof.requested}, wrote {migrationProof.written}.</div>}
          {migrationError && <div className="mt-2 text-red-200">{migrationError}</div>}
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={refreshDurableMemory} className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
            Refresh SQLite
          </button>
          <button onClick={migrateMemory} disabled={isMigrating} className="rounded-xl bg-indigo-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400">
            {isMigrating ? 'Migrating...' : 'Migrate Local Memory'}
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
        {filtered.length === 0 && <EmptyState label="No memory records match these filters." />}
        {filtered.slice(0, 18).map((item) => (
          <MemoryCard key={`${item.scope}-${item.id}`} item={item} />
        ))}
      </div>
    </Panel>
  );
}

export function EcosystemMapPanel({ ollamaStatus }) {
  const packets = listAgentPackets();
  const workflows = listWorkflows();
  const pending = packets.filter((packet) => packet.status === 'pending_approval').length;

  return (
    <Panel icon={Route} title="Live Ecosystem Map Foundation" tone="amber">
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
          <div className="space-y-3">
            <AgentNode agent="miya" title="Miya" subtitle="Creator" stat={`${packets.filter((p) => p.fromAgent === 'miya').length} handoffs`} />
            <AgentNode agent="hector" title="Hector" subtitle="Research" stat={`${packets.filter((p) => p.fromAgent === 'hector').length} reports`} />
            <AgentNode agent="maria" title="Maria" subtitle="Governance" stat={`${packets.filter((p) => p.toAgent === 'maria' || p.fromAgent === 'maria').length} audits`} />
            <AgentNode agent="sentinel" title="Sentinel" subtitle="Security" stat={`${packets.filter((p) => p.toAgent === 'sentinel' || p.fromAgent === 'sentinel').length} checks`} />
          </div>
          <div className="space-y-3">
            <AgentNode agent="jose" title="Jose" subtitle="Orchestrator" stat={`${pending} approvals`} large />
            <div className="grid grid-cols-2 gap-3">
              <MapNode icon={Brain} label="Memory" value={`${listMemoryItems().length + listMiyaMemory().length} records`} />
              <MapNode icon={GitBranch} label="Workflows" value={`${workflows.length} flows`} />
              <MapNode icon={ShieldCheck} label="Approvals" value={`${pending} pending`} />
              <MapNode icon={Activity} label="Runtime" value={ollamaStatus?.label || 'Unknown'} />
              <MapNode icon={Network} label="Plugins" value="registry active" />
              <MapNode icon={FileSearch} label="Local Files" value="proof tools available" />
            </div>
          </div>
          <div className="space-y-3">
            <AgentNode agent="alphonso" title="Alphonso" subtitle="Operator" stat={`${packets.filter((p) => p.toAgent === 'alphonso').length} inbound`} />
            <AgentNode agent="marcus" title="Marcus" subtitle="Distribution" stat={`${packets.filter((p) => p.toAgent === 'marcus' || p.fromAgent === 'marcus').length} exec routes`} />
            <AgentNode agent="echo" title="Echo" subtitle="Memory Historian" stat={`${packets.filter((p) => p.toAgent === 'echo' || p.fromAgent === 'echo').length} preserved`} />
            <AgentNode agent="nova" title="Nova" subtitle="Opportunity" stat={`${packets.filter((p) => p.toAgent === 'nova' || p.fromAgent === 'nova').length} scored`} />
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-[11px] text-zinc-400 md:grid-cols-2">
          <Relationship text="Jose routes supervised packets to Alphonso and Miya." />
          <Relationship text="Alphonso reports verification receipts back into the trust layer." />
          <Relationship text="Miya sends creative handoffs to Jose/Alphonso through the local agent bus." />
          <Relationship text="Hector creates citation-ready research drafts and sends approval handoffs to Jose." />
          <Relationship text="Maria audits risky workflows, Sentinel monitors safety, and Marcus only executes approved distribution paths." />
          <Relationship text="Echo preserves decisions and Nova scores opportunities before execution." />
          <Relationship text="Memory connects to all agents through local ledgers." />
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-500/10 p-3 text-[11px] text-amber-100/75">
        Visual foundation - live graph routing remains setup_required. Counts come from current local packets, workflow records, memory records, and runtime status.
      </div>
    </Panel>
  );
}

export function SessionIntelligencePanel() {
  const [events, setEvents] = useState(() => listSessionEvents());
  const summary = useMemo(() => summarizeSession(24), [events]);
  const timeline = [...events].reverse().slice(0, 18);

  useEffect(() => {
    const handler = () => setEvents(listSessionEvents());
    window.addEventListener('alphonso:ledger_hydrated', handler);
    return () => window.removeEventListener('alphonso:ledger_hydrated', handler);
  }, []);

  return (
    <Panel icon={Clock} title="Session Intelligence Foundation" tone="cyan">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Events" value={summary.totalEvents} tone="blue" />
        <Metric label="Warnings" value={summary.warnings?.length || 0} tone={(summary.warnings?.length || 0) ? 'red' : 'zinc'} />
        <Metric label="Unresolved" value={summary.unresolved?.length || 0} tone={(summary.unresolved?.length || 0) ? 'amber' : 'zinc'} />
        <Metric label="Window" value={`${summary.hours}h`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Timeline</div>
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
            {timeline.length === 0 && <EmptyState label="No session events recorded yet." />}
            {timeline.map((event) => (
              <div key={event.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-100">{event.title}</span>
                  <TrustBadge state={event.verificationState || event.confidence} />
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">{event.category} | {event.agent} | {new Date(event.timestampMs).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recommended Next Actions</div>
            <div className="mt-2 space-y-2">
              {(summary.recommendations || []).map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-300">{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-indigo-300/15 bg-indigo-500/10 p-3 text-[11px] text-indigo-100/75">
            Export report remains a local reporting flow until file export is added end-to-end. This panel uses real local session events when available.
          </div>
          <button onClick={() => setEvents(listSessionEvents())} className="rounded-lg bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200 hover:bg-zinc-700">Refresh Session</button>
        </div>
      </div>
    </Panel>
  );
}

export function WorkflowOperationsPanel() {
  const [rows, setRows] = useState(() => listWorkflowOperations());
  const [statusFilter, setStatusFilter] = useState('all');
  const filtered = rows.filter((row) => statusFilter === 'all' ? true : row.status === statusFilter);

  const setStatus = (workflowId, status) => {
    updateWorkflowOperationStatus(workflowId, status, {
      verificationState: status === 'active' ? TRUST_STATES.TEMPORARY : TRUST_STATES.UNVERIFIED
    });
    setRows(listWorkflowOperations());
  };

  return (
    <Panel icon={GitBranch} title="Workflow Operations Registry" tone="indigo">
      <div className="flex flex-wrap gap-2">
        {['all', 'active', 'paused', 'setup_required'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
              statusFilter === status ? 'border-indigo-300/30 bg-indigo-500/15 text-indigo-100' : 'border-white/10 bg-zinc-900/60 text-zinc-400'
            }`}
          >
            {status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
        {filtered.map((workflow) => (
          <div key={workflow.id} className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">{workflow.name}</div>
                <div className="text-[11px] text-zinc-500">{workflow.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={workflow.riskLevel === 'critical' || workflow.riskLevel === 'high' ? 'red' : workflow.riskLevel === 'medium' ? 'amber' : 'green'}>
                  {workflow.riskLevel}
                </Badge>
                <TrustBadge state={workflow.verificationState || TRUST_STATES.UNVERIFIED} />
              </div>
            </div>
            <div className="mt-2 text-[11px] text-zinc-400">{workflow.purpose}</div>
            <div className="mt-2 grid gap-1 text-[11px] text-zinc-500 md:grid-cols-2">
              <div>Sequence: {(workflow.agentSequence || []).join(' -> ')}</div>
              <div>Approvals: {(workflow.requiredApprovals || []).join(', ')}</div>
              <div>Connectors: {(workflow.connectorRequirements || []).join(', ')}</div>
              <div>
                Status:{' '}
                <span className={
                  workflow.status === 'setup_required'
                    ? 'text-indigo-300'
                    : workflow.status === 'paused'
                      ? 'text-amber-300'
                      : workflow.status === 'active'
                        ? 'text-emerald-300'
                        : 'text-zinc-400'
                }>
                  {workflow.status === 'active' ? 'active (not production-confirmed)' : workflow.status}
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(workflow.agentSequence || []).map((agentId, index) => (
                <React.Fragment key={`${workflow.id}-${agentId}-${index}`}>
                  <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 px-1.5 py-1 text-[10px] text-zinc-300">
                    <AgentAvatar agentId={agentId} name={agentId} sizeClass="h-4 w-4" className="border-white/15" />
                    <span className="capitalize">{String(agentId).replace(/_/g, ' ')}</span>
                  </div>
                  {index < (workflow.agentSequence || []).length - 1 && <span className="text-[10px] text-zinc-600">{'->'}</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="mt-2 rounded-lg border border-indigo-300/15 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-100/80">
              Needs setup: {(workflow.setupRequired || []).join(' ')}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setStatus(workflow.id, 'active')} className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-100">Active</button>
              <button onClick={() => setStatus(workflow.id, 'paused')} className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Pause</button>
              <button onClick={() => setStatus(workflow.id, 'setup_required')} className="rounded bg-amber-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-100">Setup Required</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function PrivacyShieldPanel({ settings, voiceStatus, workspaceFoundation }) {
  return (
    <Panel icon={ShieldCheck} title="Privacy Shield" tone="green">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PrivacyItem icon={Database} label="Local-only State" value={settings?.localOnlyMode ? 'Local only visible' : 'Local-only badge off'} state={settings?.localOnlyMode ? 'verified' : 'unverified'} />
        <PrivacyItem icon={Mic} label="Microphone" value={voiceStatus?.privacyLabel || 'Unknown'} state={voiceStatus?.state === 'listening' ? 'pending' : voiceStatus?.state === 'permission_denied' ? 'failed' : 'temporary'} />
        <PrivacyItem icon={FileSearch} label="Screen Capture" value={workspaceFoundation?.screenCapture?.enabled ? 'Supervised foundation enabled' : 'Off'} state={workspaceFoundation?.screenCapture?.enabled ? 'placeholder' : 'verified'} />
        <PrivacyItem icon={UploadCloud} label="Upload / Network" value="No cloud upload path enabled" state="verified" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
          Sensitive-window protection is supervised-only. No screen capture runs silently; screen/OCR foundations must stay visible and supervised.
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3 text-[11px] text-zinc-400">
          Permission audit log remains read-only until backend permission events are persisted. Current microphone state is read from the real voice foundation.
        </div>
      </div>
    </Panel>
  );
}

export function OperatorModesPanel({ settings, setSettings }) {
  const modes = [
    { id: 'mission_control', label: 'Mission Control', agent: 'jose', intensity: 'balanced', panels: 'all operating panels' },
    { id: 'developer', label: 'Developer Mode', agent: 'alphonso', intensity: 'verbose', panels: 'verification, diagnostics, plugins' },
    { id: 'creative', label: 'Creative Mode', agent: 'miya', intensity: 'medium', panels: 'studio, brand, handoff' },
    { id: 'research', label: 'Research Mode', agent: 'jose', intensity: 'low', panels: 'memory, timeline, evidence' },
    { id: 'silent', label: 'Silent Mode', agent: 'alphonso', intensity: 'minimal', panels: 'critical status only' },
    { id: 'presentation', label: 'Presentation Mode', agent: 'jose', intensity: 'quiet', panels: 'high-level ecosystem map' }
  ];
  const active = settings?.focusMode || 'mission_control';

  return (
    <Panel icon={Users} title="Operator Modes" tone="indigo">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setSettings?.({ ...settings, focusMode: mode.id })}
            className={`rounded-xl border p-3 text-left transition ${
              active === mode.id ? 'border-indigo-300/30 bg-indigo-500/15 text-indigo-50' : 'border-white/10 bg-zinc-900/55 text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{mode.label}</span>
              <Badge color={agentTone[mode.agent]}>{mode.agent}</Badge>
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">Notifications: {mode.intensity}</div>
            <div className="text-[11px] text-zinc-500">Panels: {mode.panels}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        Mode selection is wired to local settings and Command Rib emphasis. Automatic panel hiding and mascot notification tuning are follow-up UI behavior.
      </p>
    </Panel>
  );
}

function ActionReceipt({ log }) {
  const payload = log.payload || {};
  const command = payload.command || payload.program || [payload.program, ...(payload.args || [])].filter(Boolean).join(' ') || log.type;
  const exitCode = payload.exit_code ?? payload.exitCode ?? payload.code;
  const stdout = payload.stdout || payload.output;
  const stderr = payload.stderr || payload.error;
  const path = payload.path || payload.manifest_path || payload.cwd || (Array.isArray(payload.paths) ? payload.paths.join(', ') : '');

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{command}</div>
          <div className="mt-1 text-[11px] text-zinc-500">{new Date(log.timestampMs).toLocaleString()} | {log.source || 'unknown source'}</div>
        </div>
        <TrustBadge state={log.trust || TRUST_STATES.UNVERIFIED} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 md:grid-cols-3">
        <div>Type: {log.type || 'receipt'}</div>
        <div>Exit: {exitCode === undefined ? 'n/a' : String(exitCode)}</div>
        <div className="truncate">Path: {path || 'n/a'}</div>
      </div>
      {(stdout || stderr) && (
        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {stdout && <pre className="max-h-24 overflow-auto rounded-lg bg-black/30 p-2 text-[10px] text-emerald-100/80">{String(stdout).slice(0, 800)}</pre>}
          {stderr && <pre className="max-h-24 overflow-auto rounded-lg bg-black/30 p-2 text-[10px] text-red-100/80">{String(stderr).slice(0, 800)}</pre>}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ packet, onApprove, onReject }) {
  const risk = packet.riskLevel || inferRisk(packet);
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{packet.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
            <AgentAvatar agentId={packet.fromAgent} name={packet.fromAgent} sizeClass="h-4 w-4" className="border-white/15" />
            <span>{packet.fromAgent}</span>
            <span>requests {packet.actionType || packet.packetType} for</span>
            <AgentAvatar agentId={packet.toAgent} name={packet.toAgent} sizeClass="h-4 w-4" className="border-white/15" />
            <span>{packet.toAgent}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge color={riskColors[risk] || 'amber'}>{risk}</Badge>
          <TrustBadge state={packet.verificationState || packet.confidence} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 lg:grid-cols-2">
        <PreviewBlock label="Command Preview" value={packet.commandPreview || 'No command preview supplied.'} placeholder={!packet.commandPreview} />
        <PreviewBlock label="File Change Preview" value={packet.fileChangePreview || 'File diff preview is not yet wired for this packet.'} placeholder={!packet.fileChangePreview} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {packet.status === 'pending_approval' && (
          <>
            <button onClick={() => onApprove(packet.id)} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100">Approve</button>
            <button onClick={() => onReject(packet.id)} className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-100">Reject</button>
          </>
        )}
          <span className="text-[11px] text-zinc-500">Rollback: {packet.rollbackAvailable ? 'available' : 'not available'}</span>
      </div>
    </div>
  );
}

function MemoryCard({ item }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{item.title || item.category}</div>
          <div className="mt-1 text-[11px] text-zinc-500">{item.category} | {item.agent} | {item.source || 'unknown source'}</div>
        </div>
        <TrustBadge state={item.confidence || item.verificationState} />
      </div>
      <div className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-zinc-400">{formatContent(item.content)}</div>
      <div className="mt-2 text-[10px] text-zinc-600">{item.timestampMs ? new Date(item.timestampMs).toLocaleString() : 'No timestamp'}</div>
    </div>
  );
}

function AgentNode({ agent, title, subtitle, stat, large = false }) {
  const color = agentTone[agent] || 'zinc';
  return (
    <div className={`rounded-2xl border p-4 text-center ${large ? 'min-h-36' : 'min-h-28'} ${nodeClass(color)}`}>
      <div className="mb-2 flex justify-center">
        <AgentAvatar agentId={agent} name={title} sizeClass={large ? 'h-12 w-12' : 'h-10 w-10'} className="border-white/20" />
      </div>
      <div className="text-lg font-bold text-white">{title}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest opacity-70">{subtitle}</div>
      <div className="mt-3 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px]">{stat}</div>
    </div>
  );
}

function MapNode({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function Relationship({ text }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">{text}</div>;
}

function ProofTile({ icon: Icon, label, value, trust }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold text-zinc-100">{value}</span>
        <TrustBadge state={trust} />
      </div>
    </div>
  );
}

function PrivacyItem({ icon: Icon, label, value, state }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/55 p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-100">{value}</div>
      <div className="mt-2"><TrustBadge state={state} /></div>
    </div>
  );
}

function PreviewBlock({ label, value, placeholder }) {
  return (
    <div className={`rounded-lg border p-3 ${placeholder ? 'border-indigo-300/15 bg-indigo-500/10' : 'border-white/10 bg-black/20'}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</div>
      <pre className="mt-2 whitespace-pre-wrap text-[11px] text-zinc-300">{value}</pre>
      {placeholder && <div className="mt-2 text-[10px] text-indigo-200/70">preview not yet wired</div>}
    </div>
  );
}

function Metric({ label, value, tone = 'zinc' }) {
  return (
    <div className={`rounded-xl border p-3 ${metricClass(tone)}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-65">{label}</div>
      <div className="mt-1 truncate text-lg font-bold">{value}</div>
    </div>
  );
}

function Panel({ icon: Icon, title, children, tone = 'indigo' }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/72 p-4 shadow-[0_0_50px_rgba(0,0,0,0.2)]">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
        <Icon className={`h-4 w-4 ${iconClass(tone)}`} />
        {title}
      </div>
      {children}
    </section>
  );
}

function TrustBadge({ state }) {
  const color = trustColor(state || TRUST_STATES.UNVERIFIED);
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${badgeClass(color)}`}>{state || 'unverified'}</span>;
}

function Badge({ children, color = 'zinc' }) {
  return <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${badgeClass(color)}`}>{children}</span>;
}

function EmptyState({ label }) {
  return <div className="rounded-xl border border-white/10 bg-zinc-900/35 p-4 text-sm text-zinc-500">{label}</div>;
}

function countType(logs, type) {
  return logs.filter((log) => log.type === type).length;
}

function trustForType(logs, type) {
  const latest = [...logs].reverse().find((log) => log.type === type);
  return latest?.trust || TRUST_STATES.UNVERIFIED;
}

function inferAgent(source = '') {
  const lower = String(source).toLowerCase();
  if (lower.includes('hector')) return 'hector';
  if (lower.includes('miya')) return 'miya';
  if (lower.includes('jose')) return 'jose';
  if (lower.includes('maria')) return 'maria';
  if (lower.includes('marcus')) return 'marcus';
  if (lower.includes('echo')) return 'echo';
  if (lower.includes('sentinel')) return 'sentinel';
  if (lower.includes('nova')) return 'nova';
  if (lower.includes('alphonso') || lower.includes('operator') || lower.includes('runtime')) return 'alphonso';
  return 'shared';
}

function isWithinDateFilter(timestamp, filter) {
  if (!timestamp) return false;
  const now = Date.now();
  if (filter === 'today') return new Date(timestamp).toDateString() === new Date(now).toDateString();
  if (filter === '7d') return timestamp >= now - 7 * 24 * 60 * 60 * 1000;
  if (filter === '30d') return timestamp >= now - 30 * 24 * 60 * 60 * 1000;
  return true;
}

function inferRisk(packet) {
  const text = `${packet.title || ''} ${packet.packetType || ''} ${packet.commandPreview || ''}`.toLowerCase();
  if (text.includes('delete') || text.includes('remove') || text.includes('deploy') || text.includes('restore')) return 'high';
  if (text.includes('command') || text.includes('file') || text.includes('execute')) return 'medium';
  return 'low';
}

function formatContent(content) {
  if (content === null || content === undefined) return '';
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
}

function iconClass(tone) {
  if (tone === 'amber') return 'text-amber-200';
  if (tone === 'cyan') return 'text-cyan-300';
  if (tone === 'green') return 'text-emerald-300';
  return 'text-indigo-300';
}

function badgeClass(color) {
  const colors = {
    zinc: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    red: 'bg-red-500/10 text-red-300 border-red-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    fuchsia: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20'
  };
  return colors[color] || colors.zinc;
}

function metricClass(tone) {
  if (tone === 'green') return 'border-emerald-300/15 bg-emerald-500/10 text-emerald-100';
  if (tone === 'red') return 'border-red-300/15 bg-red-500/10 text-red-100';
  if (tone === 'amber') return 'border-amber-300/15 bg-amber-500/10 text-amber-100';
  if (tone === 'blue') return 'border-blue-300/15 bg-blue-500/10 text-blue-100';
  return 'border-white/10 bg-zinc-900/60 text-zinc-100';
}

function nodeClass(color) {
  if (color === 'amber') return 'border-amber-300/20 bg-amber-500/10 text-amber-100';
  if (color === 'blue') return 'border-cyan-300/20 bg-cyan-500/10 text-cyan-100';
  if (color === 'fuchsia') return 'border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-100';
  if (color === 'teal') return 'border-teal-300/20 bg-teal-500/10 text-teal-100';
  return 'border-white/10 bg-zinc-900/60 text-zinc-100';
}
