import { vi } from 'vitest';
import { TRUST_STATES, timestampMs } from '../services/trustModel';

export const createMockPolicyGate = (overrides: Partial<{
  ok: boolean;
  blocked: boolean;
  setupRequired: boolean;
  reason: string | null;
  riskLevel: 'high' | 'medium' | 'low';
  confidence: string;
  verificationState: string;
}> = {}) => {
  const defaultResult = {
    ok: true,
    blocked: false,
    setupRequired: false,
    reason: null,
    riskLevel: 'low' as const,
    confidence: TRUST_STATES.VERIFIED,
    verificationState: TRUST_STATES.VERIFIED,
    ...overrides,
  };
  return vi.fn().mockResolvedValue(defaultResult);
};

export const createMockConnectorRegistry = (overrides: Record<string, any> = {}) => {
  const defaultConnectors = {
    telegram: { id: 'telegram', status: 'configured', requiredEnv: ['TELEGRAM_BOT_TOKEN'] },
    whatsapp: { id: 'whatsapp', status: 'configured', requiredEnv: ['WHATSAPP_ACCESS_TOKEN'] },
    github: { id: 'github', status: 'configured', requiredEnv: ['GITHUB_TOKEN'] },
    slack: { id: 'slack', status: 'configured', requiredEnv: ['SLACK_BOT_TOKEN'] },
    youtube: { id: 'youtube', status: 'configured', requiredEnv: ['YOUTUBE_CLIENT_ID'] },
    notion: { id: 'notion', status: 'configured', requiredEnv: ['NOTION_API_KEY'] },
    clickup: { id: 'clickup', status: 'configured', requiredEnv: ['CLICKUP_API_KEY'] },
    chatgpt: { id: 'chatgpt', status: 'configured', requiredEnv: ['OPENAI_API_KEY'] },
    claude: { id: 'claude', status: 'configured', requiredEnv: ['ANTHROPIC_API_KEY'] },
    ...overrides,
  };
  return {
    listConnectors: vi.fn().mockReturnValue(Object.values(defaultConnectors)),
    verifyConnectorEnvironment: vi.fn().mockResolvedValue({ ok: true, envPresence: {}, status: 'configured' }),
    requireConnectorReady: vi.fn().mockResolvedValue({ ok: true }),
    requireConnectorApproval: vi.fn().mockResolvedValue({ ok: true }),
    gateConnectorAction: vi.fn().mockReturnValue({ ok: true, blocked: false }),
    getConnectorCircuitState: vi.fn().mockReturnValue({ ok: true, failures: 0, open: false }),
    recordConnectorFailure: vi.fn(),
    recordConnectorSuccess: vi.fn(),
    appendConnectorAudit: vi.fn(),
  };
};

export const createMockAgentBus = () => ({
  send: vi.fn().mockResolvedValue({ ok: true }),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  AGENTS: {
    ALPHONSO: 'alphonso',
    JOSE: 'jose',
    HECTOR: 'hector',
    MIYA: 'miya',
    MARIA: 'maria',
    MARCUS: 'marcus',
    ECHO: 'echo',
    SENTINEL: 'sentinel',
    NOVA: 'nova',
  },
});

export const createMockCache = () => {
  const store = new Map();
  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: any, ttl?: number) => { store.set(key, value); }),
    delete: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    keys: vi.fn(() => Array.from(store.keys())),
    has: vi.fn((key: string) => store.has(key)),
  };
};

export const createMockOrchestrationQueue = () => ({
  enqueue: vi.fn().mockResolvedValue({ id: 'packet-1', status: 'queued' }),
  dequeue: vi.fn().mockResolvedValue(null),
  getQueue: vi.fn().mockReturnValue([]),
  getDeadLetter: vi.fn().mockReturnValue([]),
  replay: vi.fn().mockResolvedValue({ ok: true }),
  updateStatus: vi.fn().mockResolvedValue({ ok: true }),
});

export const createMockReceiptService = () => ({
  appendOrchestrationReceipt: vi.fn().mockResolvedValue({ id: 'receipt-1' }),
  getReceipts: vi.fn().mockReturnValue([]),
});

export const createMockAgentContract = () => ({
  checkPermission: vi.fn().mockReturnValue({ allowed: true, reason: null }),
  getAgentPermissions: vi.fn().mockReturnValue({ allowed: [], blocked: [] }),
});

export const createMockLicenseService = () => ({
  canUseConnector: vi.fn().mockReturnValue(true),
  getLicenseTier: vi.fn().mockReturnValue('pro'),
  validateLicense: vi.fn().mockResolvedValue({ valid: true }),
});

export const createMockSettings = (overrides: Record<string, any> = {}) => ({
  approvalMode: false,
  zeroCostMode: true,
  safeMode: true,
  localOnlyMode: true,
  previewMode: true,
  ...overrides,
});

export const mockTimestampMs = () => {
  const now = Date.now();
  vi.spyOn(globalThis.Date, 'now').mockReturnValue(now);
  return now;
};

export function createMockInvoke(responses: Record<string, any> = {}) {
  return vi.fn().mockImplementation(async (cmd: string, args?: any) => {
    if (responses[cmd] !== undefined) {
      return typeof responses[cmd] === 'function' ? responses[cmd](args) : responses[cmd];
    }
    return { ok: true, success: true, data: null };
  });
}

export function createMockListen() {
  return vi.fn().mockImplementation(async (event: string, callback: Function) => {
    return vi.fn(); // unlisten function
  });
}

export const testUtils = {
  waitFor: (fn: () => boolean, timeout = 1000) => {
    return new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (fn()) return resolve();
        if (Date.now() - start > timeout) return reject(new Error('Timeout'));
        setTimeout(check, 10);
      };
      check();
    });
  },
  act: async (fn: () => Promise<void>) => {
    await fn();
  },
};