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
});

describe('getJoseWorkflowObservability', () => {
  it('returns observability snapshot with totals and receipts', () => {
    const obs = getJoseWorkflowObservability();
    expect(obs).toHaveProperty('totals');
    expect(obs).toHaveProperty('receipts');
    expect(typeof obs.totals).toBe('object');
  });
});
