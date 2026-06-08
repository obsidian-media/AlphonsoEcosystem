import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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

function ExecutionSection({ title, id, focusMode, openSections, onToggle, children }) {
  const open = !focusMode || openSections.has(id);
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/45 p-3">
      <button
        type="button"
        onClick={() => onToggle?.(id)}
        className="flex w-full items-center justify-between gap-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 hover:text-indigo-100"
      >
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open ? <div className="mt-3">{children}</div> : <div className="mt-2 text-[11px] text-zinc-600">Collapsed in Focus view.</div>}
    </section>
  );
}

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

function parseCsv(value = '') {
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

export function ProjectExecutionMode() {
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
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('alphonso_project_execution_density_v1') !== 'full');
  const [openSections, setOpenSections] = useState(() => new Set(['intake', 'modes', 'generate', 'outputs']));

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

  const toggleFocusMode = () => {
    setFocusMode((current) => {
      const next = !current;
      localStorage.setItem('alphonso_project_execution_density_v1', next ? 'focus' : 'full');
      return next;
    });
  };

  const toggleSection = (id) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const researchBrief = result ? createResearchBrief(result.project.projectName) : null;
  const auditReport = result ? auditProjectPlan(result.project) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Project Execution Workspace</div>
          <div className="mt-1 text-sm text-zinc-400">Plan, route, verify, and package agent work without crowding every control at once.</div>
        </div>
        <button
          type="button"
          onClick={toggleFocusMode}
          className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-100 hover:bg-indigo-500/20"
        >
          {focusMode ? 'Focus view: essentials' : 'Full view: all sections'}
        </button>
      </div>

      <ExecutionSection title="Project Intake" id="intake" focusMode={false} openSections={openSections} onToggle={toggleSection}>
        <ProjectIntakePanel
        intake={intake}
        setIntake={setIntake}
        presets={{ tapcash: TAPCASH_PRESET }}
          onApplyPreset={(preset) => setIntake((current) => ({ ...current, ...preset }))}
        />
      </ExecutionSection>

      <ExecutionSection title="System Health" id="system-health" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <SystemHealthPanel />
      </ExecutionSection>

      <ExecutionSection title="Operational Modes" id="modes" focusMode={false} openSections={openSections} onToggle={toggleSection}>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Operational Modes</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
          {OPERATIONAL_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { const next = setOperationalMode(item.id); setOpMode(next); }}
              className={`rounded-lg border px-2 py-2 text-[11px] ${opMode.id === item.id ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-100' : 'border-white/10 bg-zinc-900 text-zinc-300'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mb-4 text-[11px] text-zinc-500">Active mode emphasis: {opMode.emphasis.join(', ')}</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Proposal Mode vs Execution Mode</div>
            <div className="text-xs text-zinc-400">
              Default is read-only Proposal Mode. Execution Mode requires approval, audit, verification, and dependency checks.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAgentMode(AGENT_MODES.PROPOSAL); setMode(AGENT_MODES.PROPOSAL); }}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest ${mode === AGENT_MODES.PROPOSAL ? 'bg-indigo-500/20 text-indigo-100 border border-indigo-400/30' : 'bg-zinc-900 text-zinc-300 border border-white/10'}`}
            >
              Proposal
            </button>
            <button
              type="button"
              onClick={() => { setAgentMode(AGENT_MODES.EXECUTION); setMode(AGENT_MODES.EXECUTION); }}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest ${mode === AGENT_MODES.EXECUTION ? 'bg-amber-500/20 text-amber-100 border border-amber-400/30' : 'bg-zinc-900 text-zinc-300 border border-white/10'}`}
            >
              Execution
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            ['approved', 'Approval'],
            ['audited', 'Audit'],
            ['verified', 'Verification'],
            ['dependenciesChecked', 'Dependencies']
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = { ...execState, [key]: !execState[key] };
                setExecutionApprovalState(next);
                setExecState(next);
              }}
              className={`rounded-lg border px-3 py-2 ${execState[key] ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-zinc-900 text-zinc-300'}`}
            >
              {label}: {execState[key] ? 'pass' : 'pending'}
            </button>
          ))}
        </div>
          <div className="mt-2 text-[11px] text-zinc-500">Read-only default: {mode === AGENT_MODES.PROPOSAL ? 'enabled' : 'disabled (execution mode)'}</div>
        </div>
      </ExecutionSection>

      <ExecutionSection title="Agent Selection" id="agents" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <AgentDock agents={allProfiles} activeAgents={activeAgents} onToggleAgent={toggleAgent} />

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AgentProfilePanel agent={selectedAgent} />
          <AgentCapabilityMatrix agentPermissions={permissions} agentProfiles={agentProfileMap} />
        </div>
      </ExecutionSection>

      <ExecutionSection title="Generate Execution Packet" id="generate" focusMode={false} openSections={openSections} onToggle={toggleSection}>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Project Execution Mode</div>
          <div className="text-xs text-zinc-400">Jose decomposes and routes tasks to active agents with supervised approvals.</div>
        </div>
          <button type="button" onClick={runWorkshop} className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-indigo-100">
            Generate Execution Packet
          </button>
        </div>
      </ExecutionSection>

      <ExecutionSection title="Traceability + Proposals" id="traceability" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Traceability Chain</div>
          {!traceSummary && <div className="text-sm text-zinc-500">Run workshop to generate trace chain.</div>}
          {traceSummary && (
            <div className="space-y-1 text-xs text-zinc-300">
              <div>stages covered: {traceSummary.stagesCovered.join(' -> ')}</div>
              <div>events: {traceSummary.total}</div>
              <div>pending approvals: {traceSummary.pendingApprovals}</div>
              <div>executed: {traceSummary.executed}</div>
              <div>failed: {traceSummary.failed}</div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Diff-First Proposals</div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {proposals.length === 0 && <div className="text-sm text-zinc-500">No proposals yet.</div>}
            {proposals.map((proposal) => (
              <div key={proposal.id} className="rounded-lg border border-white/10 bg-zinc-900/40 p-2">
                <div className="text-xs font-semibold text-zinc-200">{proposal.title}</div>
                <div className="text-[11px] text-zinc-500">{proposal.agentId} | {proposal.status} | diffs: {proposal.proposedDiffs.length}</div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </ExecutionSection>

      <ExecutionSection title="Contracts + Verification Chains" id="contracts" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Work Contracts</div>
          {contracts.length === 0 && <div className="text-sm text-zinc-500">No contracts yet. Generate packet first.</div>}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {contracts.map((contract) => (
              <div key={contract.id} className="rounded-lg border border-white/10 bg-zinc-900/40 p-2">
                <div className="text-xs font-semibold text-zinc-200">{contract.objective}</div>
                <div className="text-[11px] text-zinc-500">state: {contract.state} | risk: {contract.riskLevel}</div>
                <div className="text-[11px] text-zinc-500">allowed: {contract.allowedScope.slice(0, 2).join(', ')}</div>
                <div className="text-[11px] text-zinc-500">forbidden: {contract.forbiddenScope.slice(0, 2).join(', ')}</div>
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => { signWorkContract(contract.id); refreshView(); }} className="rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-100">Sign</button>
                  <button type="button" onClick={() => { archiveWorkContract(contract.id); refreshView(); }} className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100">Archive</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Verification Chains</div>
          {chains.length === 0 && <div className="text-sm text-zinc-500">No chain yet. Generate packet first.</div>}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {chains.map((chain) => (
              <div key={chain.id} className="rounded-lg border border-white/10 bg-zinc-900/40 p-2">
                <div className="text-xs font-semibold text-zinc-200">{chain.name}</div>
                <div className="text-[11px] text-zinc-500">{chain.stages.map((stage) => `${stage.agentId}:${stage.state}`).join(' -> ')}</div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </ExecutionSection>

      <ExecutionSection title="Assignments + Agent Outputs" id="outputs" focusMode={false} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AgentAssignmentBoard packets={result?.packets || []} />
          <AgentOutputPanel outputs={result?.outputs || []} />
        </div>
      </ExecutionSection>

      <ExecutionSection title="Timeline + Approval + Final Packet" id="timeline" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ExecutionTimeline timeline={result?.sequence || []} />
          <ApprovalGatePanel gates={result?.approvalGates || []} />
          <FinalExecutionPacket finalPacket={result?.finalPacket || null} />
        </div>
      </ExecutionSection>

      <ExecutionSection title="Project DNA + AI Review" id="review" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">Project DNA</div>
          {!result?.projectDna && <div className="text-sm text-zinc-500">No project DNA yet. Generate packet first.</div>}
          {result?.projectDna && (
            <div className="space-y-1 text-xs text-zinc-300">
              <div>architecture: {result.projectDna.architecture}</div>
              <div>standards: {result.projectDna.codingStandards}</div>
              <div>stack: {result.projectDna.stack}</div>
              <div>deployment model: {result.projectDna.deploymentModel}</div>
              <div>constraints: {(result.projectDna.constraints || []).join(', ')}</div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-2">AI Review Required</div>
          {!result?.aiReviewGate && <div className="text-sm text-zinc-500">Run workshop to evaluate merge gate.</div>}
          {result?.aiReviewGate && (
            <div className="space-y-1 text-xs">
              <div className={`font-semibold ${result.aiReviewGate.passes ? 'text-emerald-200' : 'text-amber-200'}`}>
                {result.aiReviewGate.passes ? 'PASS' : 'BLOCKED'}
              </div>
              {(result.aiReviewGate.blockers || []).map((item) => (
                <div key={item} className="text-zinc-400">{item}</div>
              ))}
            </div>
          )}
        </div>
        </div>
      </ExecutionSection>

      <ExecutionSection title="Reliability Doctrine" id="doctrine" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-bold">Reliability Doctrine</div>
          <div className="text-xs text-zinc-400 mt-1">
            Reliability over impressiveness: orchestration quality, verification depth, memory confidence, auditability, rollback, and observability are prioritized over flashy autonomy.
          </div>
        </div>
      </ExecutionSection>

      <ExecutionSection title="Roadmap + Risk + Verification" id="roadmap" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ProjectRoadmap timeline={result?.project?.timeline || result?.project?.output?.proposedChanges || []} />
          <ProjectRiskRegister risks={result?.project?.riskRegister || []} />
          <ProjectVerificationChecklist checklist={result?.project?.verificationChecklist || []} />
        </div>
      </ExecutionSection>

      <ExecutionSection title="Audit + Research" id="audit-research" focusMode={focusMode} openSections={openSections} onToggle={toggleSection}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarcusAuditPanel auditReport={auditReport} />
          <HectorResearchPanel researchBrief={researchBrief} />
        </div>
      </ExecutionSection>
    </div>
  );
}
