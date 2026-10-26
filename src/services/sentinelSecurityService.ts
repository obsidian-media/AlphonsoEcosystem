import { stepInputText, type StepInput } from './jose/stepInput';
import { TRUST_STATES, timestampMs } from './trustModel';
import { generateAgentLlmResponse, getConfiguredOllamaModel, getConfiguredOllamaEndpoint } from '../lib/ollama';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt, listOrchestrationReceipts } from './orchestrationReceiptService';
import { listAgentActivity } from './agentActivityService';
import { classifyMissionRoomRisk, redactMissionRoomSecrets } from './missionRoomService';
import { resolveSecureSessionId } from './connectors/hermesAgentConnector';
import { runSentinelReview, type SentinelStepResult } from './sentinel/sentinelReview';

export interface ThreatPattern {
  pattern: RegExp;
  severity: string;
  type: string;
  weight: number;
}

export interface ThreatFinding {
  severity: string;
  type: string;
  detail: string;
  [key: string]: unknown;
}

export interface ScanResult {
  riskScore: number;
  severity: string;
  findings: ThreatFinding[];
  blocked: boolean;
  redactedText: string;
}

export interface SentinelAlertSchema {
  alertId: string;
  scope: string;
  severity: string;
  summary: string;
  findings: string[];
  recommendedAction: string;
  requiresApproval: boolean;
  confidenceLevel: string;
  verificationState: string;
  detectedAtMs: number;
}

export interface SentinelAssignment {
  commandId?: string | null;
  packetId?: string | null;
  actionType?: string;
}

export interface SentinelScanOptions {
  priorOutputs?: Record<string, { summary?: string; resultState?: string }>;
}

export interface SentinelThreatAnalysis {
  severity: string;
  requiresApproval: boolean;
  findings: string[];
  recommendedAction: string;
  summary: string;
}

export interface SentinelScanResult {
  summary: string;
  resultState: string;
  resultUrl: null;
  artifacts: Array<{ type: string; [key: string]: unknown }>;
  sources: string[];
  contractAction: string;
  schema: SentinelAlertSchema;
}

const THREAT_PATTERNS: ThreatPattern[] = [
  { pattern: /\b(api[_\s-]?key|secret|token|password|credential|auth)\s*[:=]\s*\S+/i, severity: 'critical', type: 'credential_in_command', weight: 40 },
  { pattern: /\b(rm\s+-rf|format\s+[a-z]:|drop\s+table|truncate|del\s+\/[fqs])\b/i, severity: 'critical', type: 'destructive_command', weight: 35 },
  { pattern: /\b(eval|exec|execSync|child_process|spawn|shell_exec)\b/, severity: 'high', type: 'code_execution_risk', weight: 25 },
  { pattern: /\b(sudo|su\s|chmod\s+777|chown\s+root)\b/, severity: 'high', type: 'privilege_escalation', weight: 25 },
  { pattern: /https?:\/\/(?!api\.telegram\.org|api\.openai\.com|api\.anthropic\.com|graph\.facebook\.com|api\.slack\.com|api\.github\.com|api\.notion\.com|api\.clickup\.com)\S+/i, severity: 'medium', type: 'unverified_external_url', weight: 12 },
  { pattern: /\b(publish|deploy|push\s+to\s+prod|go\s+live|release)\b/i, severity: 'medium', type: 'external_publish', weight: 10 },
  { pattern: /\b(delete|remove|destroy|wipe|clear\s+all)\b/i, severity: 'medium', type: 'destructive_action', weight: 10 },
  { pattern: /\b(install|npm\s+install|pip\s+install|cargo\s+add)\b/i, severity: 'low', type: 'dependency_install', weight: 4 }
];

/**
 * Sentinel's quick scan of recent agent work: the last `days` days of
 * orchestration receipts and the activity log (QA 2026-10-22, Bug 71). The
 * sidebar's "quick scan" used to call scanForThreats('', {}) and so always
 * reported all clear.
 */
export function scanRecentActivity(days = 7): ScanResult & { itemsScanned: number } {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const lines: string[] = [];
  const outputs: Record<string, { summary?: string; resultState?: string }> = {};
  try {
    for (const r of listOrchestrationReceipts().filter((row) => Number(row.timestampMs || 0) > since).slice(0, 200)) {
      const detail = String(r.details?.summary || r.details?.error || r.details?.reason || '');
      lines.push(`${r.agent} ${r.eventType} ${r.status} ${r.actionType || ''} ${detail}`.trim());
      if (r.status === 'failed' || r.status === 'rejected') outputs[`${r.agent}:${r.id}`] = { summary: detail, resultState: r.status };
    }
  } catch { /* receipts unavailable */ }
  try {
    for (const a of listAgentActivity().filter((row) => row.ts > since).slice(-200)) {
      lines.push(`${a.agent} ${a.action} ${a.detail || ''}`.trim());
    }
  } catch { /* activity unavailable */ }
  return { ...scanForThreats(lines.join('\n'), outputs), itemsScanned: lines.length };
}

export function scanForThreats(commandText: string, priorOutputs: Record<string, { summary?: string; resultState?: string }>): ScanResult {
  const allText = [
    String(commandText || ''),
    ...Object.values(priorOutputs || {}).map((o) => String(o?.summary || ''))
  ].join('\n');

  const redacted = redactMissionRoomSecrets(allText);
  const findings: ThreatFinding[] = [];
  let riskScore = 0;

  for (const { pattern, severity, type, weight } of THREAT_PATTERNS) {
    if (pattern.test(allText)) {
      findings.push({ severity, type, detail: `Pattern matched: ${type}` });
      riskScore += weight;
    }
  }

  const failedAgents = Object.entries(priorOutputs || {})
    .filter(([, o]) => o?.resultState === 'failed' || o?.resultState === 'rejected')
    .map(([agent]) => agent);
  if (failedAgents.length > 0) {
    riskScore += failedAgents.length * 8;
    findings.push({ severity: 'medium', type: 'prior_agent_failure', detail: `Failed agents: ${failedAgents.join(', ')}` });
  }

  const missionClassification = classifyMissionRoomRisk(allText);
  if (missionClassification.secretDetected && !findings.some((f) => f.type === 'credential_in_command')) {
    riskScore += 30;
    findings.push({ severity: 'critical', type: 'secret_detected', detail: 'Potential secret or API key detected in text.' });
  }

  riskScore = Math.min(100, Math.max(0, riskScore));

  let severity: string;
  if (riskScore >= 70) severity = 'critical';
  else if (riskScore >= 35) severity = 'high';
  else if (riskScore >= 20) severity = 'medium';
  else severity = 'low';

  return { riskScore, severity, findings, blocked: riskScore >= 70 || missionClassification.secretDetected, redactedText: redacted };
}

export function buildSentinelThreatPrompt(commandText: string, priorOutputs: Record<string, { summary?: string; resultState?: string }>, scanResult: ScanResult, stepInput: StepInput | null = null): string {
  const agentContext = stepInput ? stepInputText(stepInput) : Object.entries(priorOutputs || {})
    .map(([agent, o]) => `[${agent}] ${String(o?.summary || 'no output').slice(0, 200)}`)
    .join('\n');

  return [
    'You are Sentinel, a security monitoring agent for a local AI desktop companion.',
    'Analyze this command and prior agent context for security threats, automation safety, and permission risks.',
    'The deterministic scanner already found these findings: ' + (scanResult.findings.map((f) => f.type).join(', ') || 'none'),
    '',
    'Return ONLY valid JSON with exactly these keys (no markdown fences):',
    '{',
    '  "severity": "low"|"medium"|"high"|"critical",',
    '  "requiresApproval": true|false,',
    '  "findings": ["string", ...],',
    '  "recommendedAction": "string",',
    '  "summary": "string (one sentence)"',
    '}',
    '',
    'Command: ' + String(commandText || '').slice(0, 400),
    'Prior agent outputs:\n' + (agentContext || 'none'),
    '',
    'Rules: requiresApproval=true when severity is high or critical. Be conservative.'
  ].join('\n');
}

export function parseSentinelThreatResponse(text: string): SentinelThreatAnalysis {
  try {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      severity: ['low', 'medium', 'high', 'critical'].includes(parsed.severity) ? parsed.severity : 'medium',
      requiresApproval: Boolean(parsed.requiresApproval ?? true),
      findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 10) : [],
      recommendedAction: String(parsed.recommendedAction || 'Review before proceeding.').slice(0, 300),
      summary: String(parsed.summary || 'Sentinel threat analysis complete.').slice(0, 300)
    };
  } catch {
    return {
      severity: 'medium',
      requiresApproval: true,
      findings: ['Threat analysis inconclusive — defaulting to cautious posture.'],
      recommendedAction: 'Manual review recommended.',
      summary: 'Sentinel analysis failed to parse — flagged for manual review.'
    };
  }
}

export function buildSentinelFallbackAlert(commandText: string, scanResult: ScanResult): SentinelThreatAnalysis {
  return {
    severity: scanResult.severity,
    requiresApproval: scanResult.blocked || scanResult.severity === 'high' || scanResult.severity === 'critical',
    findings: scanResult.findings.map((f) => `${f.severity.toUpperCase()} — ${f.type}: ${f.detail}`),
    recommendedAction: scanResult.blocked
      ? 'Block execution and require operator approval before proceeding.'
      : 'Proceed with caution; monitor outputs closely.',
    summary: `Sentinel deterministic scan: risk ${scanResult.riskScore}/100 (${scanResult.severity}). ${scanResult.findings.length} finding(s).`
  };
}

/**
 * Sentinel's step (agent phase 4): his own review of the real work, the exact checks handed
 * to him as facts (`sentinel/sentinelReview.ts`). The keyword score below is no longer used
 * for his steps.
 */
export async function runSentinelSecurityScan(commandText: string, assignment: SentinelAssignment, options: SentinelScanOptions & { stepInput?: StepInput | null; commandId?: string; projectDirectory?: string; workspaceRoot?: string; signal?: AbortSignal } = {}): Promise<SentinelStepResult> {
  const input: StepInput = options.stepInput || { instruction: '', request: String(commandText || ''), needs: [], others: [], memory: '', review: null };
  return runSentinelReview(assignment as never, input, { commandId: options.commandId || assignment?.commandId || undefined, workspaceRoot: options.projectDirectory || options.workspaceRoot, signal: options.signal });
}

export function startScheduledScans(intervalMs: number, onResult: (result: ScanResult) => void): () => void {
  const ms = intervalMs ?? 10 * 60 * 1000;
  const id = setInterval(() => {
    const result = scanForThreats('', {});
    onResult?.(result);
  }, ms);
  return () => clearInterval(id);
}
