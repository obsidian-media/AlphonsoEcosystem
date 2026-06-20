import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/runtimeLedgerService', () => ({
  persistScopeRows: vi.fn(async () => undefined)
}));

vi.mock('../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: vi.fn(() => ({ id: 'receipt-test' }))
}));

vi.mock('../services/orchestrationQueueService', () => ({
  recordOrchestrationQueueTransition: vi.fn(() => undefined)
}));

vi.mock('../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn(() => undefined)
}));

import {
  parseJoseCommand,
  decomposeJoseCommand,
  listJoseCommands,
  listJoseDeadLetters,
  getJoseWorkflowObservability
} from '../services/joseCommandRouterService';

beforeEach(() => {
  localStorage.clear();
});

describe('parseJoseCommand', () => {
  it('detects research intent', () => {
    const parsed = parseJoseCommand('research the latest ollama models');
    expect(parsed.intents.research).toBe(true);
    expect(parsed.intents.creative).toBe(false);
  });

  it('detects creative intent', () => {
    const parsed = parseJoseCommand('create a video script for product launch');
    expect(parsed.intents.creative).toBe(true);
  });

  it('detects local execution intent', () => {
    const parsed = parseJoseCommand('verify the ollama runtime build');
    expect(parsed.intents.localExecution).toBe(true);
  });

  it('detects publishing intent', () => {
    const parsed = parseJoseCommand('publish the video to youtube');
    expect(parsed.intents.publishing).toBe(true);
  });

  it('detects governance/audit intent', () => {
    const parsed = parseJoseCommand('run compliance audit on the approval policy');
    expect(parsed.intents.governanceAudit).toBe(true);
  });

  it('detects security monitoring intent', () => {
    const parsed = parseJoseCommand('check for security vulnerabilities in permissions');
    expect(parsed.intents.securityMonitoring).toBe(true);
  });

  it('detects paid connector cost class', () => {
    const parsed = parseJoseCommand('send a message via chatgpt');
    expect(parsed.connectorCost.class).toBe('paid_or_metered');
  });

  it('detects zero-cost connector', () => {
    const parsed = parseJoseCommand('query ollama for a summary');
    expect(parsed.connectorCost.class).toBe('zero_cost_preferred');
  });

  it('splits fragments correctly', () => {
    const parsed = parseJoseCommand('research docs and create a script');
    expect(parsed.fragments.length).toBeGreaterThan(1);
  });

  it('normalizes empty/null input', () => {
    expect(() => parseJoseCommand('')).not.toThrow();
    expect(() => parseJoseCommand(null)).not.toThrow();
    const parsed = parseJoseCommand(null);
    expect(parsed.clean).toBe('');
  });
});

describe('decomposeJoseCommand — agent assignment routing', () => {
  it('assigns Hector for research commands', () => {
    const parsed = parseJoseCommand('research latest AI model pricing');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(Array.isArray(assignments)).toBe(true);
    expect(assignments.some((a) => a.agent === 'hector')).toBe(true);
  });

  it('assigns Miya for creative commands', () => {
    const parsed = parseJoseCommand('create a video script and storyboard');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'miya')).toBe(true);
  });

  it('assigns Miya for Maia/image generation requests without Shayan approval for safe drafting', () => {
    const parsed = parseJoseCommand('tell maia to generate an image for me');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const miya = assignments.find((a) => a.agent === 'miya');
    expect(miya).toBeTruthy();
    expect(miya.requiresApproval).toBe(false);
    expect(miya.riskLevel).toBe('low');
  });

  it('assigns Alphonso for local execution commands', () => {
    const parsed = parseJoseCommand('verify ollama runtime and run build tests');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'alphonso')).toBe(true);
  });

  it('blocks paid connectors in zero-cost mode — produces a cost enforcement assignment', () => {
    const parsed = parseJoseCommand('post via chatgpt API');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(Array.isArray(assignments)).toBe(true);
    const blocked = assignments.find((a) => a.blockedByZeroCostMode === true);
    expect(blocked).toBeTruthy();
  });

  it('allows paid connectors when zero-cost mode is off', () => {
    const parsed = parseJoseCommand('post via chatgpt API');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: false });
    const blocked = assignments.find((a) => a.blockedByZeroCostMode === true);
    expect(blocked).toBeFalsy();
  });

  it('marks risky local commands as high risk', () => {
    const parsed = parseJoseCommand('delete all temp files from the project folder');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const alphonso = assignments.find((a) => a.agent === 'alphonso');
    if (alphonso) {
      expect(alphonso.riskLevel).toBe('high');
    }
  });

  it('deduplicates assignments to the same agent', () => {
    const parsed = parseJoseCommand('research docs and lookup market data');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const hectorAssignments = assignments.filter((a) => a.agent === 'hector');
    expect(hectorAssignments.length).toBeLessThanOrEqual(1);
  });

  it('returns an array for unrecognized commands', () => {
    const parsed = parseJoseCommand('hello');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(Array.isArray(assignments)).toBe(true);
  });
});

describe('decomposeJoseCommand — agent assignment routing', () => {
  it('assigns Jose for unrecognized commands', () => {
    const parsed = parseJoseCommand('hello');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'jose')).toBe(true);
  });

  it('assigns Maria for governance/audit commands', () => {
    const parsed = parseJoseCommand('run a compliance audit on our policy');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'maria')).toBe(true);
    const maria = assignments.find((a) => a.agent === 'maria');
    expect(maria.actionType).toBe('governance_audit');
  });

  it('assigns Sentinel for security monitoring commands', () => {
    const parsed = parseJoseCommand('check security vulnerabilities and permissions');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'sentinel')).toBe(true);
    const sentinel = assignments.find((a) => a.agent === 'sentinel');
    expect(sentinel.actionType).toBe('security_monitor');
  });

  it('assigns Echo for memory preservation commands', () => {
    const parsed = parseJoseCommand('remember this decision and archive the timeline');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'echo')).toBe(true);
    const echo = assignments.find((a) => a.agent === 'echo');
    expect(echo.actionType).toBe('memory_preservation');
  });

  it('assigns Nova for opportunity scoring commands', () => {
    const parsed = parseJoseCommand('score and prioritize this opportunity by ROI');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'nova')).toBe(true);
    const nova = assignments.find((a) => a.agent === 'nova');
    expect(nova.actionType).toBe('opportunity_analysis');
  });

  it('assigns Marcus for distribution execution commands', () => {
    const parsed = parseJoseCommand('distribute and schedule this for community engagement');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.some((a) => a.agent === 'marcus')).toBe(true);
    const marcus = assignments.find((a) => a.agent === 'marcus');
    expect(marcus.requiresApproval).toBe(true);
  });

  it('assigns Hector for publishing handoff', () => {
    const parsed = parseJoseCommand('upload and publish this video to youtube');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const hectorPublish = assignments.find((a) => a.agent === 'hector' && a.actionType === 'external_publish_handoff');
    expect(hectorPublish).toBeTruthy();
    expect(hectorPublish.requiresApproval).toBe(true);
  });

  it('marks local execution as high risk when riskyLocal is true', () => {
    const parsed = parseJoseCommand('modify the build files and deploy to production');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const alphonso = assignments.find((a) => a.agent === 'alphonso');
    expect(alphonso).toBeTruthy();
    expect(alphonso.riskLevel).toBe('high');
  });

  it('marks local execution as medium risk when riskyLocal is false', () => {
    const parsed = parseJoseCommand('verify ollama runtime diagnostics');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const alphonso = assignments.find((a) => a.agent === 'alphonso');
    expect(alphonso).toBeTruthy();
    expect(alphonso.riskLevel).toBe('medium');
  });
});

describe('decomposeJoseCommand — cost and zero-cost routing', () => {
  it('sets costClass on each assignment', () => {
    const parsed = parseJoseCommand('research ollama models');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    expect(assignments.length).toBeGreaterThan(0);
    assignments.forEach((a) => {
      expect(a).toHaveProperty('costClass');
    });
  });

  it('adds Jose cost-policy gate assignment when zero-cost mode blocks paid connector', () => {
    const parsed = parseJoseCommand('send message via notion API');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const gate = assignments.find((a) => a.actionType === 'cost_policy_enforcement');
    expect(gate).toBeTruthy();
    expect(gate.agent).toBe('jose');
    expect(gate.blockedByZeroCostMode).toBe(true);
    expect(gate.requiresApproval).toBe(true);
  });

  it('does not add cost-policy gate when zero-cost mode is off', () => {
    const parsed = parseJoseCommand('send message via notion API');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: false });
    const gate = assignments.find((a) => a.actionType === 'cost_policy_enforcement');
    expect(gate).toBeFalsy();
  });

  it('classifies unknown connectors as unknown cost', () => {
    const parsed = parseJoseCommand('do something random');
    expect(parsed.connectorCost.class).toBe('unknown');
  });

  it('classifies free connectors as zero_cost_preferred', () => {
    const parsed = parseJoseCommand('generate an image using comfyui');
    expect(parsed.connectorCost.class).toBe('zero_cost_preferred');
  });
});

describe('decomposeJoseCommand — fragments and decomposition', () => {
  it('includes fragments on each assignment', () => {
    const parsed = parseJoseCommand('research ollama models and create video script');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    assignments.forEach((a) => {
      expect(a).toHaveProperty('decomposition');
      expect(Array.isArray(a.decomposition)).toBe(true);
    });
  });

  it('sets decomposition to full command when no fragments match', () => {
    const parsed = parseJoseCommand('hello world');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    assignments.forEach((a) => {
      expect(a.decomposition).toEqual([parsed.clean]);
    });
  });

  it('produces multiple assignments for multi-intent commands', () => {
    const parsed = parseJoseCommand('research ollama pricing and create a video script');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const agents = new Set(assignments.map((a) => a.agent));
    expect(agents.size).toBeGreaterThan(1);
  });
});

describe('decomposeJoseCommand — contract fields', () => {
  it('all assignments have required fields', () => {
    const parsed = parseJoseCommand('research ollama and run security audit and remember this');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    assignments.forEach((a) => {
      expect(a).toHaveProperty('agent');
      expect(a).toHaveProperty('title');
      expect(a).toHaveProperty('rationale');
      expect(a).toHaveProperty('actionType');
      expect(a).toHaveProperty('riskLevel');
      expect(a).toHaveProperty('requiresApproval');
      expect(a).toHaveProperty('commandPreview');
    });
  });

  it('Hector research assignment has low risk and no approval required', () => {
    const parsed = parseJoseCommand('research market data');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const hector = assignments.find((a) => a.agent === 'hector');
    expect(hector.riskLevel).toBe('low');
    expect(hector.requiresApproval).toBe(false);
  });

  it('Miya creative assignment has low risk and no approval required', () => {
    const parsed = parseJoseCommand('create a storyboard');
    const assignments = decomposeJoseCommand(parsed, { zeroCostMode: true });
    const miya = assignments.find((a) => a.agent === 'miya');
    expect(miya.riskLevel).toBe('low');
    expect(miya.requiresApproval).toBe(false);
  });
});

describe('listJoseCommands', () => {
  it('returns an empty array when no commands exist', () => {
    const commands = listJoseCommands();
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBe(0);
  });
});

describe('listJoseDeadLetters', () => {
  it('returns an array', () => {
    const dlq = listJoseDeadLetters();
    expect(Array.isArray(dlq)).toBe(true);
  });

  it('returns empty array when no dead letters exist', () => {
    const dlq = listJoseDeadLetters();
    expect(dlq.length).toBe(0);
  });
});

describe('getJoseWorkflowObservability', () => {
  it('returns observability snapshot with totals and receipts', () => {
    const obs = getJoseWorkflowObservability();
    expect(obs).toHaveProperty('totals');
    expect(obs).toHaveProperty('receipts');
    expect(typeof obs.totals).toBe('object');
  });

  it('has expected total fields', () => {
    const obs = getJoseWorkflowObservability();
    expect(obs.totals).toHaveProperty('commands');
    expect(obs.totals).toHaveProperty('distributed');
    expect(obs.totals).toHaveProperty('inProgress');
    expect(obs.totals).toHaveProperty('reported');
    expect(obs.totals).toHaveProperty('pendingApprovals');
    expect(obs.totals).toHaveProperty('failedPackets');
    expect(obs.totals).toHaveProperty('deadLetters');
  });

  it('starts with zero counts', () => {
    const obs = getJoseWorkflowObservability();
    expect(obs.totals.commands).toBe(0);
    expect(obs.totals.distributed).toBe(0);
    expect(obs.totals.deadLetters).toBe(0);
    expect(obs.receipts).toEqual([]);
  });
});
