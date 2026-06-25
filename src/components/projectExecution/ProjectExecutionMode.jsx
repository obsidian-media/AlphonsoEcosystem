import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { listAgentProfiles } from '../../agents/agentRegistry';
import { JOSE_PERMISSIONS } from '../../agents/jose/josePermissions';
import { ALPHONSO_PERMISSIONS } from '../../agents/alphonso/alphonsoPermissions';
import { MIYA_PERMISSIONS } from '../../agents/miya/miyaPermissions';
import { HECTOR_PERMISSIONS } from '../../agents/hector/hectorPermissions';
import { MARCUS_PERMISSIONS } from '../../agents/marcus/marcusPermissions';
import { MARIA_PERMISSIONS } from '../../agents/maria/mariaPermissions';
import { auditProjectPlan } from '../../services/audit/marcusAuditService';
import { createResearchBrief } from '../../services/hectorResearchService';
import { runProjectWorkshop } from '../../services/agentWorkshop/agentRunnerService';
import { addMemoryItem } from '../../services/memory/ecosystemMemoryService';
import { AgentDock } from '../agents/AgentDock';
import { AgentProfilePanel } from '../agents/AgentProfilePanel';
import { AgentCapabilityMatrix } from '../agents/AgentCapabilityMatrix';
import { ProjectIntakePanel } from '../agentWorkshop/ProjectIntakePanel';
import { AgentAssignmentBoard } from '../agentWorkshop/AgentAssignmentBoard';
import { AgentOutputPanel } from '../agentWorkshop/AgentOutputPanel';
import { ExecutionTimeline } from '../agentWorkshop/ExecutionTimeline';
import { ApprovalGatePanel } from '../agentWorkshop/ApprovalGatePanel';
import { FinalExecutionPacket } from '../agentWorkshop/FinalExecutionPacket';
import { ProjectRiskRegister } from './ProjectRiskRegister';
import { ProjectVerificationChecklist } from './ProjectVerificationChecklist';
import { ProjectRoadmap } from './ProjectRoadmap';
import { MarcusAuditPanel } from '../audit/MarcusAuditPanel';
import { HectorResearchPanel } from '../research/HectorResearchPanel';
import { SystemHealthPanel } from '../agentWorkshop/SystemHealthPanel';
import {
  AGENT_MODES,
  getAgentMode,
  getExecutionApprovalState,
  setAgentMode,
  setExecutionApprovalState
} from '../../services/agentWorkshop/executionModeService';
import { getTraceSummary } from '../../services/agentWorkshop/traceabilityService';
import { listDiffProposals } from '../../services/agentWorkshop/diffProposalService';
import { listWorkContracts, signWorkContract, archiveWorkContract } from '../../services/agentWorkshop/workContractService';
import { listVerificationChains } from '../../services/agentWorkshop/verificationChainService';
import { OPERATIONAL_MODES, getOperationalMode, setOperationalMode } from '../../services/agentWorkshop/operationalModeService';

// Kept for API compatibility — no longer shown in UI
export const TAPCASH_PRESET = {
  label: 'TapCash Preset',
  projectName: 'TapCash GPT Rewards Platform',
  projectDescription: 'TapCash is a GPT rewards platform for Canadian users with points, offers, referrals, and cashouts.',
  stack: 'Next.js, React, Tailwind, Firebase Auth, Firestore, Cloud Functions, Vercel, PayPal Payouts, Stripe Billing, Offerwalls',
  deadline: '12 weeks',
  projectType: 'saas',
  targetFeaturesText: 'auth,dashboard,offers,transactions,referrals,cashouts,admin panel,anti-fraud basics,premium membership,daily bonus,leaderboard,achievements',
  constraintsText: 'local-first orchestration,no fake integrations,approval required for risky actions',
  priorityLevel: 'high'
};

const ALL_AGENT_IDS = ['jose', 'alphonso', 'miya', 'hector', 'marcus', 'maria'];

const PAGE_TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'agents', label: 'Agents' },
  { id: 'execution', label: 'Execution' },
  { id: 'results', label: 'Results' },
];

function parseCsv(value = '') {
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

export function ProjectExecutionMode() {
  const [activeTab, setActiveTab] = useState('setup');
  const [intake, setIntake] = useState({
    projectName: '',
    projectDescription: '',
    stack: '',
    deadline: '',
    projectType: 'web_app',
    constraintsText: '',
    targetFeaturesText: '',
    risksText: '',
    priorityLevel: 'medium'
  });
  const [activeAgents, setActiveAgents] = useState([...ALL_AGENT_IDS]);
  const [selectedAgentId, setSelectedAgentId] = useState('jose');
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState(getAgentMode());
  const [execState, setExecState] = useState(getExecutionApprovalState());
  const [opMode, setOpMode] = useState(getOperationalMode());
  const [researchBrief, setResearchBrief] = useState(null);
  const [researchLoading, setResearchLoading] = useState(false);

  const allProfiles = useMemo(() => listAgentProfiles().filter((agent) => ALL_AGENT_IDS.includes(agent.id)), []);
  const selectedAgent = useMemo(() => allProfiles.find((agent) => agent.id === selectedAgentId) || null, [allProfiles, selectedAgentId]);
  const agentProfileMap = useMemo(() => allProfiles.reduce((acc, agent) => ({ ...acc, [agent.id]: agent }), {}), [allProfiles]);
  const permissions = useMemo(() => ({
    jose: JOSE_PERMISSIONS,
    alphonso: ALPHONSO_PERMISSIONS,
    miya: MIYA_PERMISSIONS,
    hector: HECTOR_PERMISSIONS,
    marcus: MARCUS_PERMISSIONS,
    maria: MARIA_PERMISSIONS
  }), []);

  const runWorkshop = () => {
    const projectInput = {
      ...intake,
      constraints: parseCsv(intake.constraintsText),
      targetFeatures: parseCsv(intake.targetFeaturesText),
      risks: parseCsv(intake.risksText)
    };
    const workshop = runProjectWorkshop(projectInput);
    const filteredOutputs = workshop.outputs.filter((output) => activeAgents.includes(output.agentId));
    const filteredPackets = workshop.packets.filter((packet) => {
      const id = (packet.title.split(' task: ')[0] || '').toLowerCase();
      return activeAgents.includes(id);
    });
    const next = { ...workshop, outputs: filteredOutputs, packets: filteredPackets };
    setResult(next);
    addMemoryItem({
      type: 'project_memory',
      projectId: workshop.project.id,
      agentId: 'jose',
      title: `${workshop.project.projectName} execution packet generated`,
      content: next.finalPacket.summary,
      confidence: 'inferred',
      source: 'project_execution_mode',
      tags: ['project_execution', 'jose', 'packet']
    });
    setActiveTab('results');
  };

  const traceSummary = result?.traceId ? getTraceSummary(result.traceId) : null;
  const proposals = listDiffProposals().slice(0, 6);
  const contracts = result?.traceId ? listWorkContracts({ traceId: result.traceId }) : [];
  const chains = result?.traceId ? listVerificationChains({ traceId: result.traceId }) : [];

  const toggleAgent = (agentId) => {
    setActiveAgents((current) => (
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    ));
  };

  const refreshView = () => setResult((current) => (current ? { ...current } : current));

  useEffect(() => {
    if (!result?.project?.projectName) {
      setResearchBrief(null);
      return;
    }
    let cancelled = false;
    setResearchLoading(true);
    createResearchBrief(result.project.projectName).then((brief) => {
      if (!cancelled) {
        setResearchBrief(brief);
        setResearchLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setResearchLoading(false);
    });
    return () => { cancelled = true; };
  }, [result?.project?.projectName]);

  const auditReport = result ? auditProjectPlan(result.project) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-5">

        {/* Header */}
        <header className="pb-5 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Projects</div>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Project Execution</h1>
              <p className="mt-1 text-[13px] text-zinc-500">Plan, assign, and package agent work for any project.</p>
            </div>
            {result && (
              <div className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold tracking-widest text-emerald-300">
                Packet ready
              </div>
            )}
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-1">
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-400/20'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content with Framer Motion */}
        <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >

        {/* Setup Tab */}
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <Card label="Project Details">
              <ProjectIntakePanel
                intake={intake}
                setIntake={setIntake}
                presets={{}}
                onApplyPreset={() => {}}
              />
            </Card>

            <Card label="System Health">
              <SystemHealthPanel />
            </Card>

            <Card label="Operational Mode">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {OPERATIONAL_MODES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { const next = setOperationalMode(item.id); setOpMode(next); }}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                        opMode.id === item.id
                          ? 'border-indigo-400/25 bg-indigo-500/10 text-indigo-200'
                          : 'border-white/[0.07] bg-zinc-900/50 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600">Emphasis: {opMode.emphasis.join(', ')}</p>

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[11px] text-zinc-500">Execution mode:</span>
                  <button
                    type="button"
                    onClick={() => { setAgentMode(AGENT_MODES.PROPOSAL); setMode(AGENT_MODES.PROPOSAL); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === AGENT_MODES.PROPOSAL ? 'border-indigo-400/25 bg-indigo-500/10 text-indigo-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Proposal
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAgentMode(AGENT_MODES.EXECUTION); setMode(AGENT_MODES.EXECUTION); }}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${mode === AGENT_MODES.EXECUTION ? 'border-amber-400/25 bg-amber-500/10 text-amber-200' : 'border-white/[0.07] text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Execution
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[['approved', 'Approval'], ['audited', 'Audit'], ['verified', 'Verification'], ['dependenciesChecked', 'Dependencies']].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        const next = { ...execState, [key]: !execState[key] };
                        setExecutionApprovalState(next);
                        setExecState(next);
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                        execState[key]
                          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/[0.07] bg-zinc-900/50 text-zinc-500'
                      }`}
                    >
                      {label} {execState[key] ? '✓' : '·'}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            <Card label="Active Agents">
              <AgentDock agents={allProfiles} activeAgents={activeAgents} onToggleAgent={toggleAgent} />
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card label="Agent Profile">
                <AgentProfilePanel agent={selectedAgent} />
              </Card>
              <Card label="Capability Matrix">
                <AgentCapabilityMatrix agentPermissions={permissions} agentProfiles={agentProfileMap} />
              </Card>
            </div>
          </div>
        )}

        {/* Execution Tab */}
        {activeTab === 'execution' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-indigo-400/15 bg-indigo-500/5 p-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">Generate Execution Packet</div>
                <p className="mt-0.5 text-[12px] text-zinc-500">
                  Jose decomposes your project and routes tasks to active agents with supervised approvals.
                </p>
              </div>
              <button
                type="button"
                onClick={runWorkshop}
                disabled={!intake.projectName}
                className="shrink-0 rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Generate
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card label="Traceability Chain">
                {!traceSummary
                  ? <EmptyState text="Run workshop to generate trace chain." />
                  : (
                    <div className="space-y-1.5 text-[12px] text-zinc-400">
                      <Row label="Stages" value={traceSummary.stagesCovered.join(' → ')} />
                      <Row label="Events" value={traceSummary.total} />
                      <Row label="Pending approvals" value={traceSummary.pendingApprovals} />
                      <Row label="Executed" value={traceSummary.executed} />
                      <Row label="Failed" value={traceSummary.failed} />
                    </div>
                  )}
              </Card>
              <Card label="Diff-First Proposals">
                {proposals.length === 0
                  ? <EmptyState text="No proposals yet." />
                  : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {proposals.map((proposal) => (
                        <div key={proposal.id} className="rounded-lg border border-white/[0.07] bg-zinc-900/40 p-2.5">
                          <div className="text-[12px] font-medium text-zinc-200">{proposal.title}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">{proposal.agentId} · {proposal.status} · {proposal.proposedDiffs.length} diffs</div>
                        </div>
                      ))}
                    </div>
                  )}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card label="Work Contracts">
                {contracts.length === 0
                  ? <EmptyState text="No contracts yet. Generate packet first." />
                  : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {contracts.map((contract) => (
                        <div key={contract.id} className="rounded-lg border border-white/[0.07] bg-zinc-900/40 p-2.5">
                          <div className="text-[12px] font-medium text-zinc-200">{contract.objective}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">{contract.state} · risk: {contract.riskLevel}</div>
                          <div className="mt-1.5 flex gap-1.5">
                            <SmallBtn onClick={() => { signWorkContract(contract.id); refreshView(); }} tone="green">Sign</SmallBtn>
                            <SmallBtn onClick={() => { archiveWorkContract(contract.id); refreshView(); }} tone="amber">Archive</SmallBtn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </Card>
              <Card label="Verification Chains">
                {chains.length === 0
                  ? <EmptyState text="No chain yet. Generate packet first." />
                  : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {chains.map((chain) => (
                        <div key={chain.id} className="rounded-lg border border-white/[0.07] bg-zinc-900/40 p-2.5">
                          <div className="text-[12px] font-medium text-zinc-200">{chain.name}</div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">{chain.stages.map((s) => `${s.agentId}:${s.state}`).join(' → ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </Card>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && (
          <div className="space-y-4">
            {!result ? (
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/50 p-10 text-center">
                <div className="text-sm text-zinc-500">No execution packet yet.</div>
                <button
                  type="button"
                  onClick={() => setActiveTab('execution')}
                  className="mt-3 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  Go to Execution →
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card label="Assignments">
                    <AgentAssignmentBoard packets={result.packets || []} />
                  </Card>
                  <Card label="Agent Outputs">
                    <AgentOutputPanel outputs={result.outputs || []} />
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card label="Timeline">
                    <ExecutionTimeline timeline={result.sequence || []} />
                  </Card>
                  <Card label="Approval Gates">
                    <ApprovalGatePanel gates={result.approvalGates || []} />
                  </Card>
                  <Card label="Final Packet">
                    <FinalExecutionPacket finalPacket={result.finalPacket || null} />
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card label="Roadmap">
                    <ProjectRoadmap timeline={result.project?.timeline || result.project?.output?.proposedChanges || []} />
                  </Card>
                  <Card label="Risk Register">
                    <ProjectRiskRegister risks={result.project?.riskRegister || []} />
                  </Card>
                  <Card label="Verification Checklist">
                    <ProjectVerificationChecklist checklist={result.project?.verificationChecklist || []} />
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card label="Project DNA">
                    {!result.projectDna
                      ? <EmptyState text="No DNA data." />
                      : (
                        <div className="space-y-1.5 text-[12px] text-zinc-400">
                          <Row label="Architecture" value={result.projectDna.architecture} />
                          <Row label="Standards" value={result.projectDna.codingStandards} />
                          <Row label="Stack" value={result.projectDna.stack} />
                          <Row label="Deployment" value={result.projectDna.deploymentModel} />
                        </div>
                      )}
                  </Card>
                  <Card label="AI Review Gate">
                    {!result.aiReviewGate
                      ? <EmptyState text="No review gate data." />
                      : (
                        <div className="space-y-1.5">
                          <div className={`text-sm font-semibold ${result.aiReviewGate.passes ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {result.aiReviewGate.passes ? 'PASS' : 'BLOCKED'}
                          </div>
                          {(result.aiReviewGate.blockers || []).map((item) => (
                            <div key={item} className="text-[12px] text-zinc-500">{item}</div>
                          ))}
                        </div>
                      )}
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card label="Audit">
                    <MarcusAuditPanel auditReport={auditReport} />
                  </Card>
                  <Card label="Research Brief">
                    <HectorResearchPanel researchBrief={researchBrief} loading={researchLoading} />
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Card({ label, children }) {
  return (
    <div className="card">
      {label && <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-3)]">{label}</div>}
      {children}
    </div>
  );
}

function EmptyState({ text, onAction, actionLabel }) {
  return (
    <div className="py-6 text-center space-y-3">
      <p className="text-[12px] text-[var(--text-3)]">{text}</p>
      {onAction && (
        <button type="button" onClick={onAction} className="btn-primary text-[11px] px-4 py-2">
          {actionLabel || 'Get started'}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 text-zinc-600">{label}:</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}

function SmallBtn({ onClick, tone, children }) {
  const cls = tone === 'green'
    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
    : tone === 'amber'
      ? 'border-amber-400/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
      : 'border-white/[0.07] bg-zinc-800 text-zinc-300 hover:bg-zinc-700';
  return (
    <button type="button" onClick={onClick} className={`rounded border px-2 py-1 text-[10px] font-semibold tracking-wider transition-colors ${cls}`}>
      {children}
    </button>
  );
}
