import { invoke } from '@tauri-apps/api/core';
import {
  AGENTS,
  createAgentPacket,
  getPacketById,
  listAgentPackets,
  requestPacketRetry,
  sendPacketToDeadLetter,
  updatePacketStatus
} from './agentBusService';
import { AGENT_EXECUTION_CONTRACTS as AGENT_CONTRACTS } from './agentContractService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { TRUST_STATES, timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { recordOrchestrationQueueTransition } from './orchestrationQueueService';

const COMMAND_KEY = 'alphonso_jose_command_routes_v2';
const SETTINGS_KEY = 'alphonso_settings';
export const JOSE_COMMAND_SCOPE = 'jose_command_routes_v2';
const MAX_AUTO_RETRIES = 2;
const STALE_ROUTE_MS = 10 * 60 * 1000;
const ZERO_COST_PAID_TERMS: string[] = [
  'chatgpt', 'openai', 'claude', 'anthropic', 'qwen', 'dashscope', 'alibaba', 'whatsapp', 'twilio',
  'notion', 'clickup', 'gmail', 'google drive', 'airtable'
];
const ZERO_COST_FREE_TERMS: string[] = [
  'ollama', 'comfyui', 'sd webui', 'stable diffusion', 'telegram', 'youtube'
];

export interface AgentContract {
  requiredFields: string[];
  allowedResultStates: string[];
  requiresUrlForVerified: boolean;
}

export interface JoseCommandParserIntents {
  research: boolean;
  creative: boolean;
  localExecution: boolean;
  governanceAudit: boolean;
  securityMonitoring: boolean;
  memoryPreservation: boolean;
  opportunityScoring: boolean;
  distributionExecution: boolean;
  publishing: boolean;
  riskyLocal: boolean;
  connector: boolean;
  paidConnector: boolean;
  [key: string]: boolean;
}

export interface ConnectorCostClassification {
  class: string;
  reason: string;
}

export interface JoseCommandParser {
  intents: JoseCommandParserIntents;
  fragments: string[];
  parsedAtMs: number;
  connectorCost: ConnectorCostClassification;
}

export interface JoseCommandPolicy {
  zeroCostMode: boolean;
}

export interface JoseCommandAssignment {
  agent: string;
  title: string;
  rationale: string;
  actionType: string;
  riskLevel: string;
  requiresApproval: boolean;
  commandPreview: string;
  fragments: string[];
  decomposition?: string[];
  costClass?: string;
  blockedByZeroCostMode?: boolean;
  packetId?: string;
  status?: string;
  retries?: number;
  lastUpdatedAtMs?: number;
  reportPacketId?: string;
  contractValid?: boolean;
  contractIssues?: string[];
  deadLetterAtMs?: number;
}

export interface JoseCommandReceipt {
  id: string;
  type: string;
  packetId?: string;
  reportPacketId?: string;
  agent?: string;
  trust: string;
  timestampMs: number;
}

export interface JoseCommand {
  id: string;
  source: string;
  commandText: string;
  parser: JoseCommandParser;
  policy: JoseCommandPolicy;
  contracts: AgentContract[];
  status: string;
  createdAtMs: number;
  updatedAtMs: number;
  assignments: JoseCommandAssignment[];
  receipts: JoseCommandReceipt[];
  joseConfirmation: string | null;
  deadLetters: any[];
  retryPolicy: { maxRetries: number; staleAfterMs: number };
  trust: string;
  confirmedAtMs?: number;
  shayanReport?: ShayanReport | null;
}

export interface ShayanReport {
  id: string;
  commandId: string;
  createdAtMs: number;
  fromAgent: string;
  to: string;
  summary: string;
  confirmation: string;
  resultUrl: string | null;
  assignmentCount: number;
  reportCount: number;
  pendingCount: number;
  contractFailures: { agent: string; packetId: string; issues: string[] }[];
  assignmentSummaries: {
    agent: string;
    title: string;
    assignmentStatus: string;
    reportStatus: string;
    reportSummary: string;
    artifacts: any[];
    resultUrl: string | null;
    packetId: string;
    reportPacketId: string | null;
  }[];
  trust: string;
}

export interface CommandRouteOptions {
  commandText: string;
  source?: string;
  zeroCostMode?: boolean;
}

export interface JoseCommandRouteResult {
  id: string;
  source: string;
  commandText: string;
  parser: JoseCommandParser;
  policy: JoseCommandPolicy;
  contracts: AgentContract[];
  status: string;
  createdAtMs: number;
  updatedAtMs: number;
  assignments: any[];
  receipts: JoseCommandReceipt[];
  joseConfirmation: string | null;
  deadLetters: any[];
  retryPolicy: { maxRetries: number; staleAfterMs: number };
  trust: string;
}

function readCommands(): JoseCommand[] {
  try {
    const raw = localStorage.getItem(COMMAND_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCommands(rows: JoseCommand[]): void {
  const nextRows = rows.slice(-500);
  localStorage.setItem(COMMAND_KEY, JSON.stringify(nextRows));
  persistScopeRows(JOSE_COMMAND_SCOPE, nextRows, (row: JoseCommand) => ({
    id: row.id,
    data: row,
    status: row.status || 'distributed',
    confidence: row.trust || TRUST_STATES.TEMPORARY,
    verificationState: row.trust || TRUST_STATES.UNVERIFIED,
    timestampMs: Number(row.updatedAtMs || row.createdAtMs || timestampMs())
  }));
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function riskRank(risk: string): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[risk] || 0;
}

function matchesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function shorten(text: string): string {
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

function resolveZeroCostMode(override: boolean | undefined = undefined): boolean {
  if (typeof override === 'boolean') return override;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed?.zeroCostMode === 'boolean') return parsed.zeroCostMode;
  } catch {
    // Fall through to default.
  }
  return true;
}

function classifyCommandCost(lower: string): ConnectorCostClassification {
  const paid = ZERO_COST_PAID_TERMS.some((term) => lower.includes(term));
  if (paid) return { class: 'paid_or_metered', reason: 'Uses metered/paid connector family.' };
  const free = ZERO_COST_FREE_TERMS.some((term) => lower.includes(term));
  if (free) return { class: 'zero_cost_preferred', reason: 'Uses local/free connector family.' };
  return { class: 'unknown', reason: 'No explicit connector family detected.' };
}

function defaultContractsForAssignments(assignments: JoseCommandAssignment[]): AgentContract[] {
  return assignments.map((assignment) => ({
    agent: assignment.agent,
    actionType: assignment.actionType,
    ...AGENT_CONTRACTS[assignment.agent]
  }));
}

function dedupeAssignments(assignments: JoseCommandAssignment[]): JoseCommandAssignment[] {
  const byAgent = new Map<string, JoseCommandAssignment>();
  assignments.forEach((assignment) => {
    if (!byAgent.has(assignment.agent)) {
      byAgent.set(assignment.agent, assignment);
      return;
    }
    const current = byAgent.get(assignment.agent)!;
    byAgent.set(assignment.agent, {
      ...current,
      title: `${current.title} + ${assignment.actionType.replace(/_/g, ' ')}`,
      rationale: `${current.rationale} ${assignment.rationale}`,
      actionType: `${current.actionType}+${assignment.actionType}`,
      riskLevel: riskRank(assignment.riskLevel) > riskRank(current.riskLevel) ? assignment.riskLevel : current.riskLevel,
      requiresApproval: current.requiresApproval || assignment.requiresApproval,
      commandPreview: `${current.commandPreview} ${assignment.commandPreview}`
    });
  });
  return [...byAgent.values()];
}

export function listJoseCommands(): JoseCommand[] {
  return readCommands();
}

export interface ParsedJoseCommand {
  clean: string;
  lower: string;
  intents: JoseCommandParserIntents;
  fragments: string[];
  parsedAtMs: number;
  connectorCost: ConnectorCostClassification;
}

export function parseJoseCommand(commandText: string): ParsedJoseCommand {
  const clean = String(commandText || '').trim();
  const lower = clean.toLowerCase();
  const connectorCost = classifyCommandCost(lower);
  const intents: JoseCommandParserIntents = {
    research: matchesAny(lower, ['research', 'lookup', 'docs', 'pricing', 'market', 'source', 'citation', 'latest']),
    creative: matchesAny(lower, ['video', 'script', 'brand', 'campaign', 'thumbnail', 'storyboard', 'prompt', 'creative', 'image', 'generate image', 'generate an image', 'picture', 'visual', 'miya', 'maia']),
    localExecution: matchesAny(lower, ['build', 'runtime', 'ollama', 'file', 'verify', 'diagnostic', 'install', 'command', 'fix', 'test', 'package']),
    governanceAudit: matchesAny(lower, ['audit', 'compliance', 'policy', 'approval', 'governance', 'risk']),
    securityMonitoring: matchesAny(lower, ['security', 'secrets', 'permission', 'vulnerability', 'unsafe', 'incident']),
    memoryPreservation: matchesAny(lower, ['remember', 'archive', 'knowledge', 'timeline', 'document decision', 'history']),
    opportunityScoring: matchesAny(lower, ['opportunity', 'priority', 'prioritize', 'score', 'roi', 'value', 'timing']),
    distributionExecution: matchesAny(lower, ['distribute', 'schedule', 'engage', 'community', 'publish queue']),
    publishing: matchesAny(lower, ['upload', 'publish', 'post', 'youtube', 'tiktok', 'instagram']),
    riskyLocal: matchesAny(lower, ['delete', 'remove', 'deploy', 'write', 'modify']),
    connector: matchesAny(lower, ['telegram', 'whatsapp', 'youtube', 'connector', 'api key', 'token']),
    paidConnector: connectorCost.class === 'paid_or_metered'
  };
  const fragments = clean
    .split(/(?:\band\b|,|->|then|\.)/i)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    clean,
    lower,
    intents,
    fragments,
    parsedAtMs: timestampMs(),
    connectorCost
  };
}

export interface DecomposePolicy {
  zeroCostMode?: boolean;
}

export function decomposeJoseCommand(parsed: ParsedJoseCommand, policy: DecomposePolicy = {}): JoseCommandAssignment[] {
  const { clean, lower, intents, fragments, connectorCost } = parsed;
  const zeroCostMode = resolveZeroCostMode(policy?.zeroCostMode);
  const assignments: JoseCommandAssignment[] = [];

  if (intents.research) {
    assignments.push({
      agent: AGENTS.HECTOR,
      title: `Hector research task: ${shorten(clean)}`,
      rationale: 'Research language detected. Hector should fetch and verify supplied/public sources.',
      actionType: 'research',
      riskLevel: 'low',
      requiresApproval: false,
      commandPreview: 'Research/source verification only. Read-only analysis; external actions are disabled unless separately approved.',
      fragments: fragments.filter((fragment) => /research|lookup|docs|source|latest|pricing|market/i.test(fragment))
    });
  }

  if (intents.publishing) {
    assignments.push({
      agent: AGENTS.HECTOR,
      title: `Hector publishing handoff check: ${shorten(clean)}`,
      rationale: 'Publishing language detected. Hector must validate connector/auth readiness before any external action.',
      actionType: 'external_publish_handoff',
      riskLevel: 'high',
      requiresApproval: true,
      commandPreview: 'No automatic upload. Requires connector auth + Jose/Shayan approval before any external posting.',
      fragments: fragments.filter((fragment) => /upload|publish|post|youtube|tiktok|instagram/i.test(fragment))
    });
  }

  if (intents.creative) {
    assignments.push({
      agent: AGENTS.MIYA,
      title: `Miya creative task: ${shorten(clean)}`,
      rationale: 'Creative language detected. Miya should produce script/storyboard/prompt package.',
      actionType: 'creative_package',
      riskLevel: 'low',
      requiresApproval: false,
      commandPreview: 'Creative draft/package only. Local prompt/storyboard output; external generation is disabled unless separately approved.',
      fragments: fragments.filter((fragment) => /video|script|brand|campaign|thumbnail|storyboard|prompt|creative|image|picture|visual|miya|maia/i.test(fragment))
    });
  }

  if (intents.localExecution) {
    assignments.push({
      agent: AGENTS.ALPHONSO,
      title: `Alphonso operator task: ${shorten(clean)}`,
      rationale: 'Local runtime/build/verification language detected.',
      actionType: 'local_operation',
      riskLevel: intents.riskyLocal ? 'high' : 'medium',
      requiresApproval: true,
      commandPreview: intents.riskyLocal
        ? 'Potential local/system action. Requires explicit approval.'
        : 'Local verification/diagnostic task.',
      fragments: fragments.filter((fragment) => /build|runtime|ollama|file|verify|diagnostic|install|command|fix|test|package/i.test(fragment))
    });
  }

  if (intents.governanceAudit) {
    assignments.push({
      agent: AGENTS.MARIA,
      title: `Maria governance audit: ${shorten(clean)}`,
      rationale: 'Governance/compliance/risk language detected.',
      actionType: 'governance_audit',
      riskLevel: 'medium',
      requiresApproval: false,
      commandPreview: 'Audit and governance review only. Read-only analysis; external actions are disabled unless separately approved.',
      fragments: fragments.filter((fragment) => /audit|compliance|policy|approval|governance|risk/i.test(fragment))
    });
  }

  if (intents.securityMonitoring) {
    assignments.push({
      agent: AGENTS.SENTINEL,
      title: `Sentinel safety review: ${shorten(clean)}`,
      rationale: 'Security/permission language detected.',
      actionType: 'security_monitor',
      riskLevel: 'medium',
      requiresApproval: false,
      commandPreview: 'Safety monitoring only. Read-only review; destructive actions are disabled unless separately approved.',
      fragments: fragments.filter((fragment) => /security|secrets|permission|vulnerability|unsafe|incident/i.test(fragment))
    });
  }

  if (intents.memoryPreservation) {
    assignments.push({
      agent: AGENTS.ECHO,
      title: `Echo memory preservation: ${shorten(clean)}`,
      rationale: 'Knowledge/timeline preservation language detected.',
      actionType: 'memory_preservation',
      riskLevel: 'low',
      requiresApproval: false,
      commandPreview: 'Preserve decisions/workflow context only.',
      fragments: fragments.filter((fragment) => /remember|archive|knowledge|timeline|history|decision/i.test(fragment))
    });
  }

  if (intents.opportunityScoring) {
    assignments.push({
      agent: AGENTS.NOVA,
      title: `Nova opportunity analysis: ${shorten(clean)}`,
      rationale: 'Opportunity/priority language detected.',
      actionType: 'opportunity_analysis',
      riskLevel: 'low',
      requiresApproval: false,
      commandPreview: 'Opportunity scoring only. No execution.',
      fragments: fragments.filter((fragment) => /opportunity|priority|score|roi|value|timing/i.test(fragment))
    });
  }

  if (intents.distributionExecution) {
    assignments.push({
      agent: AGENTS.MARCUS,
      title: `Marcus distribution handoff: ${shorten(clean)}`,
      rationale: 'Distribution/scheduling language detected.',
      actionType: 'distribution_execution',
      riskLevel: 'high',
      requiresApproval: true,
      commandPreview: 'Distribution handoff requires Shayan approval before connector execution.',
      fragments: fragments.filter((fragment) => /distribute|schedule|engage|community|publish/i.test(fragment))
    });
  }

  if (!assignments.length) {
    assignments.push({
      agent: AGENTS.JOSE,
      title: `Jose planning task: ${shorten(clean)}`,
      rationale: 'No specialist match found. Jose keeps this for orchestration planning.',
      actionType: 'orchestration_review',
      riskLevel: 'low',
      requiresApproval: false,
      commandPreview: 'Planning only.',
      fragments
    });
  }

  const normalized = dedupeAssignments(assignments).map((assignment) => ({
    ...assignment,
    decomposition: assignment.fragments?.length ? assignment.fragments : [clean],
    costClass: connectorCost?.class || 'unknown'
  }));

  if (zeroCostMode && intents.paidConnector) {
    normalized.push({
      agent: AGENTS.JOSE,
      title: `Jose cost-policy gate: ${shorten(clean)}`,
      rationale: 'Zero-Cost Mode detected a paid/metered connector request. Jose must approve and reroute to local/free alternatives first.',
      actionType: 'cost_policy_enforcement',
      riskLevel: 'high',
      requiresApproval: true,
      commandPreview: 'Blocked by Zero-Cost Mode default policy until explicit approval override.',
      decomposition: [clean],
      costClass: connectorCost?.class || 'paid_or_metered',
      blockedByZeroCostMode: true
    });
  }

  return normalized;
}

async function decomposeViaBackend(parsed: ParsedJoseCommand): Promise<JoseCommandAssignment[] | null> {
  try {
    const rows: any[] = await invoke('decompose_jose_command_backend', {
      commandText: parsed.clean
    });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map((row: any) => ({
      agent: row.agent,
      title: row.title,
      rationale: row.rationale,
      actionType: row.actionType,
      riskLevel: row.riskLevel,
      requiresApproval: Boolean(row.requiresApproval),
      commandPreview: row.commandPreview,
      decomposition: Array.isArray(row.decomposition) ? row.decomposition : [parsed.clean]
    }));
  } catch {
    return null;
  }
}

export async function createJoseCommandRoute({ commandText, source = 'shayan', zeroCostMode = undefined }: CommandRouteOptions): Promise<JoseCommandRouteResult | null> {
  const parsed = parseJoseCommand(commandText);
  if (!parsed.clean) return null;

  const backendAssignments = await decomposeViaBackend(parsed);
  const assignments = backendAssignments || decomposeJoseCommand(parsed, { zeroCostMode });
  const effectiveZeroCostMode = resolveZeroCostMode(zeroCostMode);
  const command: JoseCommand = {
    id: newId('jose-command'),
    source,
    commandText: parsed.clean,
    parser: {
      intents: parsed.intents,
      fragments: parsed.fragments,
      parsedAtMs: parsed.parsedAtMs,
      connectorCost: parsed.connectorCost
    },
    policy: {
      zeroCostMode: effectiveZeroCostMode
    },
    contracts: defaultContractsForAssignments(assignments),
    status: 'distributed',
    createdAtMs: timestampMs(),
    updatedAtMs: timestampMs(),
    assignments: [],
    receipts: [],
    joseConfirmation: null,
    deadLetters: [],
    retryPolicy: {
      maxRetries: MAX_AUTO_RETRIES,
      staleAfterMs: STALE_ROUTE_MS
    },
    trust: TRUST_STATES.TEMPORARY
  };

  const routed = assignments.map((assignment) => {
    const packet = createAgentPacket({
      fromAgent: AGENTS.JOSE,
      toAgent: assignment.agent,
      title: assignment.title,
      packetType: 'jose_assigned_work',
      payload: {
        joseCommandId: command.id,
        originalCommand: parsed.clean,
        assignment,
        contract: AGENT_CONTRACTS[assignment.agent],
        policy: {
          zeroCostMode: effectiveZeroCostMode,
          blockedByZeroCostMode: Boolean(assignment.blockedByZeroCostMode),
          costClass: assignment.costClass || parsed.connectorCost?.class || 'unknown'
        }
      },
      source: 'jose-command-router',
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED,
      requiresApproval: assignment.requiresApproval,
      riskLevel: assignment.riskLevel,
      actionType: assignment.actionType,
      commandPreview: assignment.commandPreview,
      fileChangePreview: 'No file changes are executed by routing. Agent must report back to Jose.',
      rollbackAvailable: false
    });
    recordOrchestrationQueueTransition({
      commandId: command.id,
      packetId: packet.id,
      agent: AGENTS.JOSE,
      fromStatus: 'new',
      toStatus: packet.status,
      reason: 'Jose decomposition created assignment packet.',
      retryCount: 0,
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    appendOrchestrationReceipt({
      workflowId: 'jose_command_router',
      commandId: command.id,
      packetId: packet.id,
      eventType: 'assignment_created',
      status: packet.status,
      agent: AGENTS.JOSE,
      actionType: assignment.actionType,
      riskLevel: assignment.riskLevel,
      approved: packet.status === 'approved',
      blocked: packet.status === 'pending_approval',
      setupRequired: false,
      details: {
        title: assignment.title,
        rationale: assignment.rationale,
        source
      },
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.UNVERIFIED
    });
    return {
      ...assignment,
      packetId: packet.id,
      status: packet.status,
      retries: 0,
      lastUpdatedAtMs: packet.updatedAtMs
    };
  });

  command.assignments = routed;
  const rows = readCommands();
  rows.push(command);
  writeCommands(rows);

  appendSessionEvent({
    category: 'orchestration',
    title: 'Jose distributed Shayan command',
    details: { commandId: command.id, assignmentCount: routed.length, parser: command.parser.intents },
    agent: AGENTS.JOSE,
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED
  });
  appendOrchestrationReceipt({
    workflowId: 'jose_command_router',
    commandId: command.id,
    packetId: null,
    eventType: 'command_distributed',
    status: 'distributed',
    agent: AGENTS.JOSE,
    actionType: 'orchestration_decompose_route',
    riskLevel: 'low',
    approved: false,
    blocked: false,
    setupRequired: false,
    details: {
      assignmentCount: routed.length,
      source,
      intents: command.parser?.intents || {}
    },
    confidence: TRUST_STATES.TEMPORARY,
    verificationState: TRUST_STATES.UNVERIFIED
  });

  return command;
}

interface ContractValidation {
  valid: boolean;
  missing: string[];
  invalidState: boolean;
  urlMissing: boolean;
}

function validateReportContract(assignment: JoseCommandAssignment, reportPayload: any): ContractValidation {
  const contract = AGENT_CONTRACTS[assignment?.agent] || AGENT_CONTRACTS[AGENTS.JOSE];
  const payload = reportPayload || {};
  const missing = contract.requiredFields.filter((field) => {
    const value = payload[field];
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  });
  const state = String(payload.resultState || 'pending_review');
  const invalidState = !contract.allowedResultStates.includes(state);
  const urlMissing = contract.requiresUrlForVerified && state === 'verified' && !payload.resultUrl;
  return {
    valid: missing.length === 0 && !invalidState && !urlMissing,
    missing,
    invalidState,
    urlMissing
  };
}

function updateCommandWithReport(commandId: string, packetId: string, reportPacket: any, contractValidation: ContractValidation): JoseCommand | null {
  const rows = readCommands().map((command) => {
    if (command.id !== commandId) return command;
    const assignments = (command.assignments || []).map((assignment) => {
      if (assignment.packetId !== packetId) return assignment;
      return {
        ...assignment,
        status: contractValidation.valid ? 'report_received' : 'contract_invalid',
        reportPacketId: reportPacket.id,
        contractValid: contractValidation.valid,
        contractIssues: contractValidation.valid
          ? []
          : [
            ...(contractValidation.missing.length ? [`missing: ${contractValidation.missing.join(', ')}`] : []),
            ...(contractValidation.invalidState ? ['invalid resultState'] : []),
            ...(contractValidation.urlMissing ? ['verified result requires url'] : [])
          ],
        lastUpdatedAtMs: timestampMs()
      };
    });
    const receipts = [
      ...(command.receipts || []),
      {
        id: newId('receipt'),
        type: 'agent_report_received',
        packetId,
        reportPacketId: reportPacket.id,
        agent: reportPacket.fromAgent,
        trust: contractValidation.valid ? TRUST_STATES.INFERRED : TRUST_STATES.FAILED,
        timestampMs: timestampMs()
      }
    ].slice(-200);
    return {
      ...command,
      assignments,
      receipts,
      status: 'in_progress',
      updatedAtMs: timestampMs(),
      trust: contractValidation.valid ? TRUST_STATES.TEMPORARY : TRUST_STATES.FAILED
    };
  });
  writeCommands(rows);
  return rows.find((row) => row.id === commandId) || null;
}

export interface AgentReportInput {
  packetId: string;
  reportingAgent?: string;
  summary?: string;
  resultState?: string;
  resultUrl?: string | null;
  artifacts?: any[];
  sources?: any[];
}

export function createAgentReportToJose({
  packetId,
  reportingAgent,
  summary,
  resultState = 'pending_review',
  resultUrl = null,
  artifacts = [],
  sources = []
}: AgentReportInput): { reportPacket: any; command: JoseCommand | null; contractValidation: ContractValidation } | null {
  const packet = getPacketById(packetId);
  if (!packet) return null;
  const commandId = packet.payload?.joseCommandId;
  if (!commandId) return null;
  const command = readCommands().find((item) => item.id === commandId);
  if (!command) return null;
  const assignment = (command.assignments || []).find((item) => item.packetId === packetId);
  if (!assignment) return null;

  const reportPayload = {
    originalPacketId: packet.id,
    summary: summary || 'Agent report submitted for Jose review.',
    resultState,
    resultUrl,
    artifacts,
    sources
  };
  const contractValidation = validateReportContract(assignment, reportPayload);

  const reportPacket = createAgentPacket({
    fromAgent: reportingAgent || packet.toAgent,
    toAgent: AGENTS.JOSE,
    title: `Report to Jose: ${packet.title}`,
    packetType: 'agent_report_to_jose',
    payload: reportPayload,
    source: 'jose-command-router',
    confidence: contractValidation.valid ? TRUST_STATES.TEMPORARY : TRUST_STATES.FAILED,
    verificationState: contractValidation.valid ? TRUST_STATES.UNVERIFIED : TRUST_STATES.FAILED,
    requiresApproval: false,
    riskLevel: 'low',
    actionType: 'agent_report',
    commandPreview: 'No command execution. Report back to Jose only.',
    fileChangePreview: 'No file changes.',
    rollbackAvailable: false
  });

  updatePacketStatus(packet.id, 'reported_to_jose', {
    reportPacketId: reportPacket.id,
    reportedAtMs: timestampMs(),
    verificationState: contractValidation.valid ? TRUST_STATES.TEMPORARY : TRUST_STATES.FAILED
  });
  recordOrchestrationQueueTransition({
    commandId,
    packetId: packet.id,
    agent: reportingAgent || packet.toAgent || AGENTS.JOSE,
    fromStatus: packet.status || 'unknown',
    toStatus: 'reported_to_jose',
    reason: 'Agent report received by Jose.',
    retryCount: packet.retryCount || 0,
    confidence: contractValidation.valid ? TRUST_STATES.TEMPORARY : TRUST_STATES.FAILED,
    verificationState: contractValidation.valid ? TRUST_STATES.UNVERIFIED : TRUST_STATES.FAILED
  });

  const updatedCommand = updateCommandWithReport(commandId, packetId, reportPacket, contractValidation);
  appendOrchestrationReceipt({
    workflowId: 'jose_command_router',
    commandId,
    packetId,
    eventType: 'agent_report_received',
    status: contractValidation.valid ? 'report_received' : 'contract_invalid',
    agent: reportingAgent || packet.toAgent || AGENTS.JOSE,
    actionType: assignment.actionType,
    riskLevel: assignment.riskLevel || 'low',
    approved: true,
    blocked: false,
    setupRequired: false,
    details: {
      reportPacketId: reportPacket.id,
      contractValidation
    },
    confidence: contractValidation.valid ? TRUST_STATES.TEMPORARY : TRUST_STATES.FAILED,
    verificationState: contractValidation.valid ? TRUST_STATES.UNVERIFIED : TRUST_STATES.FAILED
  });

  appendSessionEvent({
    category: 'orchestration',
    title: 'Agent reported back to Jose',
    details: {
      originalPacketId: packet.id,
      reportPacketId: reportPacket.id,
      reportingAgent: reportingAgent || packet.toAgent,
      contractValid: contractValidation.valid
    },
    agent: AGENTS.JOSE,
    confidence: contractValidation.valid ? TRUST_STATES.TEMPORARY : TRUST_STATES.FAILED,
    verificationState: contractValidation.valid ? TRUST_STATES.UNVERIFIED : TRUST_STATES.FAILED
  });

  return {
    reportPacket,
    command: updatedCommand,
    contractValidation
  };
}

function collectAgentReports(command: JoseCommand): any[] {
  const packetIds = new Set((command.assignments || []).map((assignment) => assignment.packetId));
  return listAgentPackets().filter((packet) => (
    packet.packetType === 'agent_report_to_jose' && packetIds.has(packet.payload?.originalPacketId)
  ));
}

function buildShayanSummary(command: JoseCommand, reports: any[], resultUrl: string | null, pendingAssignments: JoseCommandAssignment[]): string {
  if (!reports.length) {
    return `Jose distributed "${shorten(command.commandText)}" and is waiting for agent reports.`;
  }
  const pendingText = pendingAssignments.length
    ? `${pendingAssignments.length} assignment(s) still need verified completion.`
    : 'All assigned agents have reported completion.';
  const urlText = resultUrl
    ? ` Result URL: ${resultUrl}`
    : ' No final URL has been verified yet.';
  return `Jose merged ${reports.length} agent report(s). ${pendingText}${urlText}`;
}

function updateCommandOnConfirm(commandId: string, payload: Partial<JoseCommand>): JoseCommand | null {
  const rows = readCommands().map((row) => (
    row.id === commandId
      ? {
        ...row,
        ...payload,
        updatedAtMs: timestampMs()
      }
      : row
  ));
  writeCommands(rows);
  return rows.find((command) => command.id === commandId) || null;
}

export function createJoseReportToShayan(
  commandId: string,
  confirmation: string = 'Jose reviewed agent reports and confirmed the command state.'
): JoseCommand | null {
  const command = readCommands().find((item) => item.id === commandId);
  if (!command) return null;
  const reports = collectAgentReports(command);
  const assignments = command.assignments || [];
  const resultUrl = reports
    .map((report) => report.payload?.resultUrl || report.payload?.url)
    .find(Boolean) || null;
  const pendingAssignments = assignments.filter((assignment) => {
    const report = reports.find((item) => item.payload?.originalPacketId === assignment.packetId);
    const state = report?.payload?.resultState;
    return !report || !['verified', 'completed'].includes(state);
  });
  const hasContractFailure = assignments.some((assignment) => assignment.status === 'contract_invalid');

  const shayanReport: ShayanReport = {
    id: newId('jose-shayan-report'),
    commandId,
    createdAtMs: timestampMs(),
    fromAgent: AGENTS.JOSE,
    to: 'shayan',
    summary: buildShayanSummary(command, reports, resultUrl, pendingAssignments),
    confirmation,
    resultUrl,
    assignmentCount: assignments.length,
    reportCount: reports.length,
    pendingCount: pendingAssignments.length,
    contractFailures: assignments.filter((assignment) => assignment.status === 'contract_invalid').map((assignment) => ({
      agent: assignment.agent,
      packetId: assignment.packetId,
      issues: assignment.contractIssues || []
    })),
    assignmentSummaries: assignments.map((assignment) => {
      const report = reports.find((item) => item.payload?.originalPacketId === assignment.packetId);
      return {
        agent: assignment.agent,
        title: assignment.title,
        assignmentStatus: assignment.status,
        reportStatus: report?.payload?.resultState || 'not_reported',
        reportSummary: report?.payload?.summary || 'No agent report received yet.',
        artifacts: Array.isArray(report?.payload?.artifacts) ? report.payload.artifacts : [],
        resultUrl: report?.payload?.resultUrl || null,
        packetId: assignment.packetId,
        reportPacketId: report?.id || null
      };
    }),
    trust: hasContractFailure
      ? TRUST_STATES.FAILED
      : pendingAssignments.length
        ? TRUST_STATES.INFERRED
        : TRUST_STATES.VERIFIED
  };

  const updatedCommand = updateCommandOnConfirm(commandId, {
    status: 'reported_to_shayan',
    joseConfirmation: confirmation,
    shayanReport,
    confirmedAtMs: timestampMs(),
    trust: shayanReport.trust
  });
  appendOrchestrationReceipt({
    workflowId: 'jose_command_router',
    commandId,
    packetId: null,
    eventType: 'jose_merge_confirm_reported',
    status: 'reported_to_shayan',
    agent: AGENTS.JOSE,
    actionType: 'orchestration_merge_confirm',
    riskLevel: pendingAssignments.length ? 'medium' : 'low',
    approved: true,
    blocked: false,
    setupRequired: false,
    details: {
      reportId: shayanReport.id,
      assignmentCount: assignments.length,
      reportCount: reports.length,
      pendingCount: pendingAssignments.length,
      resultUrl
    },
    confidence: shayanReport.trust,
    verificationState: shayanReport.trust
  });

  appendSessionEvent({
    category: 'orchestration',
    title: 'Jose reported command result to Shayan',
    details: { commandId, reportId: shayanReport.id, resultUrl, trust: shayanReport.trust },
    agent: AGENTS.JOSE,
    confidence: shayanReport.trust,
    verificationState: shayanReport.trust
  });
  return updatedCommand;
}

export function confirmJoseCommand(commandId: string, confirmation: string): JoseCommand | null {
  return createJoseReportToShayan(commandId, confirmation);
}

export function runJoseRetrySweep(): { touched: string[] } {
  const now = timestampMs();
  const commands = readCommands();
  const touched: string[] = [];

  commands.forEach((command) => {
    const maxRetries = command.retryPolicy?.maxRetries ?? MAX_AUTO_RETRIES;
    let changed = false;
    const nextAssignments = (command.assignments || []).map((assignment) => {
      const packet = getPacketById(assignment.packetId || '');
      if (!packet) return assignment;

      const stale = now - Number(packet.updatedAtMs || packet.createdAtMs || now) > (command.retryPolicy?.staleAfterMs ?? STALE_ROUTE_MS);
      const failed = packet.status === 'failed' || packet.status === 'rejected';
      if (!stale && !failed) return assignment;

      const retries = Number(packet.retryCount || assignment.retries || 0);
      if (retries >= maxRetries) {
        sendPacketToDeadLetter(packet.id, 'Exceeded retry policy in Jose orchestration.');
        recordOrchestrationQueueTransition({
          commandId: command.id,
          packetId: packet.id,
          agent: AGENTS.JOSE,
          fromStatus: packet.status || 'unknown',
          toStatus: 'dead_letter',
          reason: 'Exceeded retry policy in Jose orchestration.',
          retryCount: retries,
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        appendOrchestrationReceipt({
          workflowId: 'jose_command_router',
          commandId: command.id,
          packetId: packet.id,
          eventType: 'retry_exhausted_dead_letter',
          status: 'dead_letter',
          agent: AGENTS.JOSE,
          actionType: assignment.actionType,
          riskLevel: assignment.riskLevel || 'medium',
          approved: false,
          blocked: true,
          setupRequired: false,
          details: { retries, maxRetries },
          confidence: TRUST_STATES.FAILED,
          verificationState: TRUST_STATES.FAILED
        });
        changed = true;
        return {
          ...assignment,
          status: 'dead_letter',
          retries,
          deadLetterAtMs: timestampMs(),
          lastUpdatedAtMs: timestampMs()
        };
      }

      requestPacketRetry(packet.id, stale ? 'Stale handoff auto-retry.' : 'Failed handoff retry.');
      recordOrchestrationQueueTransition({
        commandId: command.id,
        packetId: packet.id,
        agent: AGENTS.JOSE,
        fromStatus: packet.status || 'unknown',
        toStatus: 'queued',
        reason: stale ? 'Stale handoff auto-retry.' : 'Failed handoff retry.',
        retryCount: retries + 1,
        confidence: TRUST_STATES.TEMPORARY,
        verificationState: TRUST_STATES.PENDING
      });
      appendOrchestrationReceipt({
        workflowId: 'jose_command_router',
        commandId: command.id,
        packetId: packet.id,
        eventType: 'assignment_retry_requested',
        status: 'queued',
        agent: AGENTS.JOSE,
        actionType: assignment.actionType,
        riskLevel: assignment.riskLevel || 'medium',
        approved: true,
        blocked: false,
        setupRequired: false,
        details: { stale, retries: retries + 1 },
        confidence: TRUST_STATES.TEMPORARY,
        verificationState: TRUST_STATES.PENDING
      });
      changed = true;
      return {
        ...assignment,
        status: 'queued',
        retries: retries + 1,
        lastUpdatedAtMs: timestampMs()
      };
    });

    if (changed) {
      command.assignments = nextAssignments;
      command.updatedAtMs = timestampMs();
      command.status = 'retrying';
      command.receipts = [
        ...(command.receipts || []),
        {
          id: newId('receipt'),
          type: 'retry_sweep',
          timestampMs: timestampMs(),
          trust: TRUST_STATES.TEMPORARY
        }
      ].slice(-200);
      touched.push(command.id);
    }
  });

  writeCommands(commands);
  if (touched.length) {
    appendSessionEvent({
      category: 'orchestration',
      title: 'Jose retry sweep executed',
      details: { commandCount: touched.length, commandIds: touched },
      agent: AGENTS.JOSE,
      confidence: TRUST_STATES.TEMPORARY,
      verificationState: TRUST_STATES.PENDING
    });
  }
  return { touched };
}

export function listJoseDeadLetters(): any[] {
  const commands = readCommands();
  return commands.flatMap((command) => (
    (command.assignments || [])
      .filter((assignment) => assignment.status === 'dead_letter')
      .map((assignment) => ({
        commandId: command.id,
        commandText: command.commandText,
        ...assignment
      }))
  ));
}

export interface WorkflowObservabilityTotals {
  commands: number;
  distributed: number;
  inProgress: number;
  reported: number;
  pendingApprovals: number;
  failedPackets: number;
  deadLetters: number;
}

export interface WorkflowObservability {
  totals: WorkflowObservabilityTotals;
  receipts: any[];
}

export function getJoseWorkflowObservability(): WorkflowObservability {
  const commands = readCommands();
  const packets = listAgentPackets();
  const totals: WorkflowObservabilityTotals = {
    commands: commands.length,
    distributed: commands.filter((command) => command.status === 'distributed').length,
    inProgress: commands.filter((command) => ['distributed', 'in_progress', 'retrying'].includes(command.status)).length,
    reported: commands.filter((command) => command.status === 'reported_to_shayan').length,
    pendingApprovals: packets.filter((packet) => packet.status === 'pending_approval').length,
    failedPackets: packets.filter((packet) => packet.status === 'failed').length,
    deadLetters: listJoseDeadLetters().length
  };

  const receipts = commands
    .flatMap((command) => (command.receipts || []).map((receipt) => ({ ...receipt, commandId: command.id })))
    .slice(-150)
    .reverse();

  return { totals, receipts };
}
