import React, { Suspense, lazy, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  Layers3,
  Network,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  Workflow
} from 'lucide-react';
import {
  addPacketReference,
  approvePacket,
  listAgentPackets,
  listApprovalQueue,
  markPacketExecuted,
  rejectPacket
} from '../services/agentBusService';
import {
  installSkillPack,
  listSkillPackAudit,
  listSkillPacks,
  setSkillPackEnabled,
  uninstallSkillPack,
  validateSkillPackManifest
} from '../services/skillPackService';
import {
  WORKFLOW_NODE_LIBRARY,
  addWorkflowEdge,
  addWorkflowNode,
  createWorkflow,
  listWorkflows
} from '../services/workflowBuilderService';
import { appendSessionEvent, listSessionEvents, summarizeSession } from '../services/sessionIntelligenceService';
import { collectResourceSnapshot, listResourceSnapshots, summarizeResourceUsage } from '../services/resourceCostService';
import { listMarketplaceItems, setMarketplaceItemStatus } from '../services/localMarketplaceService';
import { listSnapshots } from '../services/recoveryService';
import { ProductionReadinessPanel } from './ProductionReadinessPanel';
import { SelfDevelopmentPanel } from './SelfDevelopmentPanel';
import { EcosystemMaturityPanelsGate } from './EcosystemMaturityPanelsGate';
import { AgentPairingView } from './AgentPairingView';
import { ProjectIntakePanel } from './agentWorkshop/ProjectIntakePanel';
import { AgentAssignmentBoard } from './agentWorkshop/AgentAssignmentBoard';
import { AgentOutputPanel } from './agentWorkshop/AgentOutputPanel';
import { ApprovalGatePanel } from './agentWorkshop/ApprovalGatePanel';
import { ExecutionTimeline } from './agentWorkshop/ExecutionTimeline';
import { FinalExecutionPacket } from './agentWorkshop/FinalExecutionPacket';
import { SystemHealthPanel } from './agentWorkshop/SystemHealthPanel';

const WorkflowOperationsDashboard = lazy(() =>
  import('./WorkflowOperationsDashboard').then((module) => ({
    default: module.WorkflowOperationsDashboard
  }))
);

interface Props {
  settings: Record<string, unknown>;
  setSettings: (settings: Record<string, unknown>) => void;
  ollamaStatus: { state: string };
  verificationLogs?: unknown[];
  voiceStatus: Record<string, unknown>;
  workspaceFoundation: Record<string, unknown>;
  updateCheckState: Record<string, unknown>;
  nativeSelfDevProof: Record<string, unknown>;
  setNativeSelfDevProof: (val: Record<string, unknown>) => void;
  nativeProofHooks: Record<string, unknown>;
}

export function EcosystemHub({ settings, setSettings, ollamaStatus, verificationLogs = [], voiceStatus, workspaceFoundation, updateCheckState, nativeSelfDevProof, setNativeSelfDevProof, nativeProofHooks }: Props) {
  const [packets, setPackets] = useState<{ id: string; status: string; fromAgent: string; toAgent: string; [key: string]: unknown }[]>(() => listAgentPackets());
  const [skills, setSkills] = useState<{ id: string; name: string; version: string; enabled: boolean; type: string; [key: string]: unknown }[]>(() => listSkillPacks());
  const [skillAudit, setSkillAudit] = useState(() => listSkillPackAudit());
  const [workflows, setWorkflows] = useState<{ id: string; name: string; nodes: unknown[]; edges: unknown[]; [key: string]: unknown }[]>(() => listWorkflows());
  const [sessionSummary, setSessionSummary] = useState<{ totalEvents: number; warnings?: unknown[]; unresolved?: unknown[]; hours: number; recommendations?: string[] }>(() => summarizeSession(24));
  const [resourceSummary, setResourceSummary] = useState<{ points: number; avgTokenEstimate: number }>(() => summarizeResourceUsage(24));
  const [resourceSnapshots, setResourceSnapshots] = useState(() => listResourceSnapshots());
  const [marketItems, setMarketItems] = useState<{ id: string; name: string; type: string; status: string; [key: string]: unknown }[]>(() => listMarketplaceItems());
  const [snapshots, setSnapshots] = useState<{ id: string; timestampMs: number; payload?: Record<string, unknown> }[]>(() => listSnapshots());
  const [showAdvancedSections, setShowAdvancedSections] = useState<string>('overview');
  const [manifestInput, setManifestInput] = useState('{\n  "id": "pack.youtube-studio",\n  "name": "YouTube Pack",\n  "version": "1.0.0",\n  "permissions": ["memory.read", "workflows.write"],\n  "category": "creator"\n}');
  const [newWorkflowName, setNewWorkflowName] = useState('Shayan -> Jose -> Agents -> Jose Confirmation Flow');
  const [handoffNote, setHandoffNote] = useState('Creative packet validated and queued for supervised execution.');

  const approvalQueue = useMemo(() => listApprovalQueue() as { id: string; title: string; fromAgent: string; toAgent: string; packetType: string }[], [packets]);
  const timeline = useMemo(() => listSessionEvents().slice(-30).reverse() as { id: string; title: string; category: string; timestampMs: number }[], [sessionSummary, packets, workflows, resourceSnapshots]);

  const refreshAll = () => {
    setPackets(listAgentPackets());
    setSkills(listSkillPacks());
    setSkillAudit(listSkillPackAudit());
    setWorkflows(listWorkflows());
    setSessionSummary(summarizeSession(24));
    setResourceSummary(summarizeResourceUsage(24));
    setResourceSnapshots(listResourceSnapshots());
    setMarketItems(listMarketplaceItems());
    setSnapshots(listSnapshots());
  };

  const runApprove = (packetId: string) => {
    approvePacket(packetId, 'operator');
    appendSessionEvent({
      category: 'approval',
      title: 'Packet approved',
      details: { packetId },
      agent: 'alphonso'
    });
    refreshAll();
  };

  const runReject = (packetId: string) => {
    rejectPacket(packetId, 'Rejected by operator review queue.');
    appendSessionEvent({
      category: 'approval',
      title: 'Packet rejected',
      details: { packetId },
      agent: 'alphonso'
    });
    refreshAll();
  };

  const runExecutePacket = (packetId: string) => {
    const packet = markPacketExecuted(packetId, {
      status: 'execution_report_ready',
      note: handoffNote
    });
    if (packet) {
      addPacketReference(packetId, {
        type: 'execution_report',
        value: `exec-${Date.now()}`
      });
    }
    appendSessionEvent({
      category: 'task',
      title: 'Packet marked executed',
      details: { packetId, status: 'resolved' },
      agent: 'alphonso'
    });
    refreshAll();
  };

  const runInstallSkillPack = () => {
    let parsed = null;
    try {
      parsed = JSON.parse(manifestInput);
    } catch {
      parsed = null;
    }

    if (!parsed) return;
    installSkillPack(parsed);
    appendSessionEvent({
      category: 'skill_pack',
      title: 'Skill pack installed',
      details: { id: parsed.id },
      agent: 'alphonso'
    });
    refreshAll();
  };

  const runValidateManifest = () => {
    let parsed = null;
    try {
      parsed = JSON.parse(manifestInput);
    } catch {
      parsed = null;
    }
    const result = validateSkillPackManifest(parsed);
    appendSessionEvent({
      category: 'verification',
      title: 'Skill manifest validation',
      details: result,
      agent: 'alphonso',
      verificationState: result.valid ? 'verified' : 'failed'
    });
    refreshAll();
  };

  const runCreateWorkflow = () => {
    const flow = createWorkflow(newWorkflowName, 'shared');
    let updated = addWorkflowNode(flow.id, 'trigger', { x: 0, y: 0 }, { label: 'Shayan command received' });
    updated = addWorkflowNode(flow.id, 'approval', { x: 220, y: 0 }, { label: 'Jose routes and gates approvals' });
    updated = addWorkflowNode(flow.id, 'action', { x: 440, y: 0 }, { label: 'Agents report back to Jose' });
    if (updated?.nodes?.length >= 3) {
      addWorkflowEdge(flow.id, updated.nodes[0].id, updated.nodes[1].id, 'always');
      addWorkflowEdge(flow.id, updated.nodes[1].id, updated.nodes[2].id, 'if approved');
    }
    appendSessionEvent({
      category: 'workflow',
      title: 'Workflow created',
      details: { id: flow.id, name: flow.name },
      agent: 'alphonso'
    });
    refreshAll();
  };

  const runResourceSnapshot = () => {
    collectResourceSnapshot({
      ollamaConnected: ollamaStatus.state === 'connected',
      modelName: settings.selectedModel,
      tokenEstimate: Math.round((timeline.length + packets.length) * 250)
    });
    appendSessionEvent({
      category: 'runtime',
      title: 'Resource snapshot collected',
      details: { model: settings.selectedModel || null },
      agent: 'alphonso'
    });
    refreshAll();
  };

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'queue', label: 'Queue' },
    { id: 'skills', label: 'Skills' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'pairings', label: 'Pairings' },
    { id: 'workshop', label: 'Workshop' },
    { id: 'advanced', label: 'Advanced' },
  ];

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
      <header className="pb-4 border-b border-white/[0.06]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">All Agents</div>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Agent Ecosystem</h1>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setShowAdvancedSections(tab.id)}
            className={`rounded-lg px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
              showAdvancedSections === tab.id
                ? 'bg-indigo-500/10 text-indigo-200 border border-indigo-400/20'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={showAdvancedSections}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="space-y-4"
        >
          {/* OVERVIEW TAB */}
          {(showAdvancedSections === 'overview') && (
            <EcosystemMaturityPanelsGate
              showAdvancedSections={false}
              settings={settings}
              setSettings={setSettings}
              ollamaStatus={ollamaStatus}
              verificationLogs={verificationLogs}
              voiceStatus={voiceStatus}
              workspaceFoundation={workspaceFoundation}
              onRefresh={refreshAll}
            />
          )}

          {/* QUEUE TAB */}
          {showAdvancedSections === 'queue' && (
            <div className="space-y-4">
              <Panel icon={Network} title="Handoff Queue">
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {approvalQueue.length === 0 && <p className="text-sm text-zinc-500">No pending approvals.</p>}
                  {approvalQueue.map((packet) => (
                    <div key={packet.id} className="rounded-lg border border-white/10 bg-zinc-900/55 p-3 space-y-2">
                      <div className="text-xs font-semibold text-zinc-200">{packet.title}</div>
                      <div className="text-[11px] text-zinc-500">{packet.fromAgent} {'→'} {packet.toAgent} | {packet.packetType}</div>
                      <div className="flex gap-1.5">
                        <button onClick={() => runApprove(packet.id)} className="rounded border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/15 transition-colors">Approve</button>
                        <button onClick={() => runReject(packet.id)} className="rounded border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-300 hover:bg-red-500/15 transition-colors">Reject</button>
                        <button onClick={() => runExecutePacket(packet.id)} className="rounded border border-white/[0.08] bg-zinc-800/60 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700/60 transition-colors">Execute</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500">Execution Note</label>
                  <input value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-[11px]" />
                </div>
              </Panel>
              <Panel icon={ShieldAlert} title="Human Override">
                <div className="space-y-2 text-[11px] text-zinc-400">
                  <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2">Safe mode and approval gates remain active.</div>
                  <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2">Emergency stop: reject all pending packets.</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => approvalQueue.forEach((p) => runReject(p.id))} className="rounded bg-red-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-200 flex items-center gap-1">
                    <PauseCircle className="h-3.5 w-3.5" /> Emergency Stop
                  </button>
                  <button onClick={() => approvalQueue.forEach((p) => runApprove(p.id))} className="rounded bg-emerald-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-200 flex items-center gap-1">
                    <PlayCircle className="h-3.5 w-3.5" /> Resume Queue
                  </button>
                </div>
              </Panel>
            </div>
          )}

          {/* SKILLS TAB */}
          {showAdvancedSections === 'skills' && (
            <Panel icon={Layers3} title="Skill Pack System">
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {skills.length === 0 && <p className="text-sm text-zinc-500">No skill packs installed.</p>}
                {skills.map((skill) => (
                  <div key={skill.id} className="rounded-lg border border-white/10 bg-zinc-900/55 px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">{skill.name}</div>
                      <div className="text-[11px] text-zinc-500">{skill.id} | v{skill.version}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setSkillPackEnabled(skill.id, !skill.enabled); refreshAll(); }} className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-200">{skill.enabled ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => { uninstallSkillPack(skill.id); refreshAll(); }} className="rounded bg-red-500/20 px-2 py-1 text-[10px] text-red-200">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 block">Install from manifest JSON</label>
                <textarea value={manifestInput} onChange={(e) => setManifestInput(e.target.value)} rows={6} className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-200" />
                <div className="mt-2 flex gap-2">
                  <button onClick={runValidateManifest} className="rounded bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Validate</button>
                  <button onClick={runInstallSkillPack} className="rounded bg-indigo-500/25 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100">Install</button>
                </div>
              </div>
            </Panel>
          )}

          {/* WORKFLOWS TAB */}
          {showAdvancedSections === 'workflows' && (
            <div className="space-y-4">
              <Panel icon={Workflow} title="Workflows">
                <div className="flex gap-2">
                  <input value={newWorkflowName} onChange={(e) => setNewWorkflowName(e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" />
                  <button onClick={runCreateWorkflow} className="rounded bg-indigo-500/25 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100">Create</button>
                </div>
                <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                  {workflows.length === 0 && <p className="text-sm text-zinc-500">No workflows yet.</p>}
                  {workflows.map((flow) => (
                    <div key={flow.id} className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-300">
                      {flow.name} — {flow.nodes.length} nodes, {flow.edges.length} edges
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel icon={Activity} title="Session Timeline (24h)">
                <div className="text-[11px] text-zinc-400 mb-2">Events: {sessionSummary.totalEvents} | Warnings: {sessionSummary.warnings?.length || 0}</div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {timeline.length === 0 && <p className="text-sm text-zinc-500">No events yet.</p>}
                  {timeline.map((event) => (
                    <div key={event.id} className="rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2">
                      <div className="text-[11px] text-zinc-200">{event.title}</div>
                      <div className="text-[10px] text-zinc-500">{event.category} · {new Date(event.timestampMs).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* PAIRINGS TAB */}
          {showAdvancedSections === 'pairings' && (
            <div className="space-y-4">
              <AgentPairingView />
            </div>
          )}

          {/* WORKSHOP TAB */}
          {showAdvancedSections === 'workshop' && (
            <div className="space-y-4">
              <SystemHealthPanel />
              <ProjectIntakePanel
                intake={{ projectName: '', stack: '', deadline: '', projectType: 'web_app', projectDescription: '', targetFeaturesText: '', constraintsText: '' }}
                setIntake={() => {}}
              />
              <AgentAssignmentBoard packets={[]} />
              <AgentOutputPanel outputs={[]} />
              <ApprovalGatePanel gates={[]} />
              <ExecutionTimeline timeline={[]} />
              <FinalExecutionPacket finalPacket={null} />
            </div>
          )}

          {/* ADVANCED TAB */}
          {showAdvancedSections === 'advanced' && (
            <div className="space-y-4">
              <EcosystemMaturityPanelsGate
                showAdvancedSections={true}
                settings={settings}
                setSettings={setSettings}
                ollamaStatus={ollamaStatus}
                verificationLogs={verificationLogs}
                voiceStatus={voiceStatus}
                workspaceFoundation={workspaceFoundation}
                onRefresh={refreshAll}
              />
              <Suspense fallback={<div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3 text-sm text-zinc-400">Loading…</div>}>
                <WorkflowOperationsDashboard settings={settings} />
              </Suspense>
              <ProductionReadinessPanel
                settings={settings}
                setSettings={setSettings}
                ollamaStatus={ollamaStatus}
                verificationLogs={verificationLogs}
                workspaceFoundation={workspaceFoundation}
                updateCheckState={updateCheckState}
                nativeSelfDevProof={nativeSelfDevProof}
              />
              <SelfDevelopmentPanel
                settings={settings}
                setSettings={setSettings}
                verificationLogs={verificationLogs}
                workspaceFoundation={workspaceFoundation}
                updateCheckState={updateCheckState}
                nativeSelfDevProof={nativeSelfDevProof as any}
                setNativeSelfDevProof={setNativeSelfDevProof as any}
                nativeProofHooks={nativeProofHooks as any}
              />
              <Panel icon={CheckCircle2} title="Resource Awareness">
                <div className="flex gap-2">
                  <button onClick={runResourceSnapshot} className="rounded bg-indigo-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-100">Collect Snapshot</button>
                  <button onClick={refreshAll} className="rounded bg-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-200">Refresh</button>
                </div>
                <div className="mt-2 text-[11px] text-zinc-400">Points: {resourceSummary.points} | Avg tokens: {resourceSummary.avgTokenEstimate}</div>
              </Panel>
              <MarketplacePanel marketItems={marketItems} onRefresh={refreshAll} />
              <SnapshotDiffPanel snapshots={snapshots} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    </div>
  );
}

function SnapshotDiffPanel({ snapshots }: { snapshots: Record<string, unknown>[] }) {
  const sorted = [...snapshots].sort((a, b) => (b.timestampMs as number) - (a.timestampMs as number));
  const [leftId, setLeftId]   = useState(() => (sorted[0]?.id as string) || '');
  const [rightId, setRightId] = useState(() => (sorted[1]?.id as string) || '');

  const left  = sorted.find((s) => s.id === leftId);
  const right = sorted.find((s) => s.id === rightId);

  const diffKeys = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) => {
    const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    const rows = [];
    for (const k of allKeys) {
      const av = JSON.stringify(a?.[k] ?? null);
      const bv = JSON.stringify(b?.[k] ?? null);
      rows.push({ key: k, left: av, right: bv, changed: av !== bv });
    }
    return rows;
  };

  const payloadA = (left?.payload || {}) as Record<string, unknown>;
  const payloadB = (right?.payload || {}) as Record<string, unknown>;
  const rows = diffKeys(payloadA, payloadB);
  const changedCount = rows.filter((r) => r.changed).length;

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-bold">
        <Activity className="w-4 h-4 text-indigo-300" /> Snapshot Diff
        {changedCount > 0 && <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[9px] text-amber-300">{changedCount} changed</span>}
      </div>

      {sorted.length < 2 ? (
        <div className="text-[11px] text-zinc-600">Need at least 2 snapshots to compare. Create snapshots from the Ecosystem sidebar.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
                {([['Left (A)', leftId, setLeftId], ['Right (B)', rightId, setRightId]] as any[][]).map(([label, val, setter]) => (
              <div key={label}>
                <div className="text-[9px] font-bold uppercase text-zinc-600 mb-1">{label}</div>
                <select
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-white/10 px-2 py-1.5 text-[10px] text-zinc-200 outline-none"
                >
                  {sorted.map((s) => (
                    <option key={s.id as string} value={s.id as string}>
                      {new Date(s.timestampMs as number).toLocaleString()} — {(s.id as string).slice(-8)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
            {rows.length === 0 && <div className="text-[11px] text-zinc-600">Both snapshots are empty.</div>}
            {rows.map((row) => (
              <div key={row.key} className={`rounded-lg px-2 py-1.5 text-[10px] ${row.changed ? 'bg-amber-950/30 border border-amber-500/20' : 'bg-zinc-900/30 border border-white/[0.04]'}`}>
                <div className={`font-mono font-bold mb-0.5 ${row.changed ? 'text-amber-200' : 'text-zinc-500'}`}>{row.key}</div>
                {row.changed ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-zinc-400 truncate">A: {row.left.slice(0, 60)}</div>
                    <div className="text-zinc-200 truncate">B: {row.right.slice(0, 60)}</div>
                  </div>
                ) : (
                  <div className="text-zinc-600 truncate">{row.left.slice(0, 80)}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const TYPE_FILTERS = ['all', 'agent', 'skill_pack', 'connector', 'workflow', 'theme'];
const STATUS_COLOR: Record<string, string> = { installed: 'text-emerald-300 border-emerald-500/30 bg-emerald-950/30', available: 'text-zinc-400 border-zinc-600/30 bg-zinc-900/30', installing: 'text-blue-300 border-blue-500/30 bg-blue-950/30' };

function MarketplacePanel({ marketItems, onRefresh }: { marketItems: Record<string, unknown>[]; onRefresh: () => void }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [registryUrl, setRegistryUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');

  const visible = typeFilter === 'all' ? marketItems : marketItems.filter((i) => i.type === typeFilter);

  const fetchRemote = async () => {
    const url = registryUrl.trim();
    if (!url) return;
    setFetching(true);
    setFetchMsg('');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      items.forEach((item: { id?: string; name?: string; status?: string }) => {
        if (item.id && item.name) {
          setMarketplaceItemStatus(item.id, item.status || 'available');
        }
      });
      setFetchMsg(`Loaded ${items.length} item(s) from registry.`);
      onRefresh();
    } catch (err) {
      setFetchMsg(`Fetch failed: ${(err as Error).message}`);
    } finally {
      setFetching(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3.5 space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-bold">
        <Layers3 className="w-4 h-4 text-indigo-300" /> Plugin Marketplace
      </div>

      {/* Remote registry fetch */}
      <div className="flex gap-2">
        <input
          value={registryUrl}
          onChange={(e) => setRegistryUrl(e.target.value)}
          placeholder="Registry URL (optional)"
          className="flex-1 rounded-lg bg-zinc-900 border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/40"
        />
        <button
          onClick={fetchRemote}
          disabled={fetching || !registryUrl.trim()}
          className="rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 text-[10px] font-bold text-indigo-200 hover:bg-indigo-500/35 disabled:opacity-50"
        >
          {fetching ? '…' : 'Fetch'}
        </button>
      </div>
      {fetchMsg && <div className="text-[10px] text-zinc-500">{fetchMsg}</div>}

      {/* Type filters */}
      <div className="flex flex-wrap gap-1">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${typeFilter === t ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-200' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t} {t === 'all' ? `(${marketItems.length})` : `(${marketItems.filter((i) => i.type === t).length})`}
          </button>
        ))}
      </div>

      {/* Item grid */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {visible.map((item: any) => (
          <div key={item.id} className="rounded-lg border border-white/[0.06] bg-zinc-900/40 px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-zinc-200 truncate">{item.name}</div>
              <div className="text-[10px] text-zinc-600">{item.type} · {item.id}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_COLOR[item.status] || STATUS_COLOR.available}`}>
                {item.status}
              </span>
              {item.status === 'installed'
                ? <button onClick={() => { setMarketplaceItemStatus(item.id, 'available'); onRefresh(); }} className="text-[9px] text-zinc-500 hover:text-red-400 font-bold uppercase">Remove</button>
                : <button onClick={() => { setMarketplaceItemStatus(item.id, 'installed'); onRefresh(); }} className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold uppercase">Install</button>
              }
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="text-[11px] text-zinc-600 py-3 text-center">No items in this category.</div>}
      </div>
    </section>
  );
}

function Panel({ icon: Icon, title, children }: { icon: typeof Layers3; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)] mb-3">
        <Icon className="w-3.5 h-3.5 text-[var(--accent)]" /> {title}
      </div>
      {children}
    </section>
  );
}
