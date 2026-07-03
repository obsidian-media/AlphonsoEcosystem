import { TRUST_STATES, timestampMs } from './trustModel';
import { generateOllamaResponse, PREFERRED_MODEL, DEFAULT_OLLAMA_ENDPOINT } from '../lib/ollama';
import { pushMemoryItem } from './memoryService';
import { appendSessionEvent } from './sessionIntelligenceService';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { classifyMissionRoomRisk, redactMissionRoomSecrets } from './missionRoomService';

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

export function buildSentinelThreatPrompt(commandText: string, priorOutputs: Record<string, { summary?: string; resultState?: string }>, scanResult: ScanResult): string {
  const agentContext = Object.entries(priorOutputs || {})
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

export async function runSentinelSecurityScan(commandText: string, assignment: SentinelAssignment, options: SentinelScanOptions = {}): Promise<SentinelScanResult> {
  const startMs = timestampMs();
  const priorOutputs = options.priorOutputs || {};

  const scanResult = scanForThreats(commandText, priorOutputs);

  let ollamaResult: SentinelThreatAnalysis | null = null;
  const shouldRunOllama = scanResult.findings.length > 0 || String(commandText || '').length > 80;
  if (shouldRunOllama) {
    try {
      const prompt = buildSentinelThreatPrompt(commandText, priorOutputs, scanResult);
      const response = await generateOllamaResponse({ endpoint: DEFAULT_OLLAMA_ENDPOINT, model: PREFERRED_MODEL, prompt });
      ollamaResult = parseSentinelThreatResponse(response?.response || '');
    } catch {
      // Ollama unavailable — use deterministic fallback
    }
  }

  const fallback = buildSentinelFallbackAlert(commandText, scanResult);
  const merged = ollamaResult || fallback;

  const finalBlocked = scanResult.blocked || merged.severity === 'critical';
  const finalSeverity = finalBlocked && merged.severity !== 'critical'
    ? (scanResult.severity === 'critical' ? 'critical' : merged.severity)
    : merged.severity;
  const finalRequiresApproval = merged.requiresApproval || finalBlocked;

  const alertId = `sentinel_${assignment?.commandId || ''}_${startMs}`;
  const schema: SentinelAlertSchema = {
    alertId,
    scope: 'global',
    severity: finalSeverity,
    summary: merged.summary,
    findings: [
      ...scanResult.findings.map((f) => `[SCAN] ${f.type}: ${f.detail}`),
      ...(ollamaResult?.findings || []).map((f) => `[ANALYSIS] ${f}`)
    ],
    recommendedAction: merged.recommendedAction,
    requiresApproval: finalRequiresApproval,
    confidenceLevel: ollamaResult ? TRUST_STATES.VERIFIED : TRUST_STATES.INFERRED,
    verificationState: ollamaResult ? TRUST_STATES.VERIFIED : TRUST_STATES.INFERRED,
    detectedAtMs: startMs
  };

  pushMemoryItem({
    title: `Sentinel scan: ${String(commandText || '').slice(0, 80)}`,
    category: 'runtime_memory',
    content: { schema, riskScore: scanResult.riskScore, blocked: finalBlocked },
    source: 'sentinel-security-service',
    sourceAgent: 'sentinel',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendSessionEvent({
    category: 'security',
    title: finalBlocked ? `Sentinel BLOCKED (${finalSeverity})` : `Sentinel cleared (${finalSeverity})`,
    details: { riskScore: scanResult.riskScore, severity: finalSeverity, findings: schema.findings.length, blocked: finalBlocked },
    agent: 'sentinel',
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  appendOrchestrationReceipt({
    workflowId: assignment?.commandId || 'sentinel_scan',
    commandId: assignment?.commandId || null,
    packetId: assignment?.packetId || null,
    eventType: finalBlocked ? 'sentinel_scan_blocked' : 'sentinel_scan_cleared',
    status: finalBlocked ? 'pending_review' : 'completed',
    agent: 'sentinel',
    actionType: assignment?.actionType || 'security_monitor',
    riskLevel: finalSeverity,
    approved: !finalRequiresApproval,
    blocked: finalBlocked,
    details: { riskScore: scanResult.riskScore, findingsCount: schema.findings.length, ollamaUsed: !!ollamaResult, durationMs: timestampMs() - startMs },
    confidence: schema.confidenceLevel,
    verificationState: schema.verificationState
  });

  const summaryParts = [
    `Sentinel security scan: risk ${scanResult.riskScore}/100 (${finalSeverity}).`,
    `${schema.findings.length} finding(s).`,
    finalBlocked ? 'BLOCKED — operator approval required before execution.' : 'Cleared for execution.',
    merged.recommendedAction
  ].filter(Boolean).join(' ');

  return {
    summary: summaryParts,
    resultState: finalBlocked ? 'pending_review' : 'completed',
    resultUrl: null,
    artifacts: [
      {
        type: 'security_assessment',
        riskScore: scanResult.riskScore,
        severity: finalSeverity,
        blocked: finalBlocked,
        findings: scanResult.findings,
        secretDetected: scanResult.findings.some((f) => f.type === 'secret_detected' || f.type === 'credential_in_command'),
        approvalRequired: finalRequiresApproval
      },
      { type: 'sentinel_alert_schema', schema }
    ],
    sources: [],
    contractAction: assignment?.actionType || 'security_monitor',
    schema
  };
}

export function startScheduledScans(intervalMs: number, onResult: (result: ScanResult) => void): () => void {
  const ms = intervalMs ?? 10 * 60 * 1000;
  const id = setInterval(() => {
    const result = scanForThreats('', {});
    onResult?.(result);
  }, ms);
  return () => clearInterval(id);
}
