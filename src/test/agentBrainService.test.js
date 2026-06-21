import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  needsClarification,
  decomposeTask,
  getRelevantPatterns,
  buildThinkingPrompt
} from '../services/agentBrainService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => ({ findings: [] })) }));
vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{"plan":"test","files":[],"summary":"done"}' })),
  generateOllamaStream: vi.fn(async () => 'stream result')
}));
vi.mock('../services/joseExecutionEngineService', () => ({
  parseJsonResponse: vi.fn((v) => { try { return JSON.parse(v); } catch { return null; } })
}));
vi.mock('../services/verificationService', () => ({
  verifyCommandExecution: vi.fn(async () => ({ payload: { success: true, exitCode: 0, stdout: 'ok' } }))
}));
vi.mock('../services/workspaceArtifactService', () => ({ writeWorkspaceArtifact: vi.fn(async () => ({})) }));
vi.mock('../services/trustModel', () => ({
  timestampMs: () => Date.now(),
  TRUST_STATES: { VERIFIED: 'verified', INFERRED: 'inferred', UNVERIFIED: 'unverified', FAILED: 'failed' }
}));
vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/modelSelectionService', () => ({ getModelForTask: vi.fn(() => 'llama3') }));
vi.mock('../services/autoRunService', () => ({
  autoRunDevServer: vi.fn(),
  getAutoRunEnabled: vi.fn(() => false)
}));
vi.mock('../services/composioService', () => ({
  isComposioEnabled: vi.fn(() => false),
  executeViaComposio: vi.fn()
}));
vi.mock('../services/agentMetricsService', () => ({ recordAgentExecution: vi.fn() }));
vi.mock('../services/toolRegistryService', () => ({
  getToolDefinitions: vi.fn(() => []),
  formatToolsForPrompt: vi.fn(() => ''),
  executeTool: vi.fn(async () => ({ success: true }))
}));

// ── localStorage mock ─────────────────────────────────────────────────────────

const localStorageStore = {};
const mockLocalStorage = {
  getItem: vi.fn((k) => localStorageStore[k] ?? null),
  setItem: vi.fn((k, v) => { localStorageStore[k] = v; }),
  removeItem: vi.fn((k) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); }),
  length: 0,
  key: vi.fn()
};
vi.stubGlobal('localStorage', mockLocalStorage);

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
});

// ── needsClarification ────────────────────────────────────────────────────────

describe('needsClarification', () => {
  it('returns true for a very vague short command', () => {
    expect(needsClarification('build an app')).toBe(true);
  });

  it('returns false for a specific command with many words', () => {
    expect(needsClarification('build a React todo app with CRUD operations and local storage')).toBe(false);
  });

  it('returns true for single-word commands', () => {
    expect(needsClarification('website')).toBe(true);
  });

  it('returns false for commands with specific project types like dashboard', () => {
    expect(needsClarification('build a SaaS dashboard for analytics with charts and filters')).toBe(false);
  });

  it('handles empty string without throwing', () => {
    expect(() => needsClarification('')).not.toThrow();
  });

  it('returns true for vague requests without action verbs', () => {
    expect(needsClarification('some thing cool')).toBe(true);
  });
});

// ── decomposeTask ─────────────────────────────────────────────────────────────

describe('decomposeTask', () => {
  it('returns an array of step strings', () => {
    const steps = decomposeTask('build a todo app');
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(typeof steps[0]).toBe('string');
  });

  it('decomposes fullstack tasks into server + client steps', () => {
    const steps = decomposeTask('build a fullstack MERN app');
    const combined = steps.join(' ').toLowerCase();
    expect(combined).toMatch(/server|client|react|express/);
  });

  it('decomposes dashboard into layout/cards steps', () => {
    const steps = decomposeTask('create an admin dashboard');
    const combined = steps.join(' ').toLowerCase();
    expect(combined).toMatch(/layout|dashboard|widget|card/);
  });

  it('decomposes api into routes/middleware steps', () => {
    const steps = decomposeTask('build a REST api server with Express');
    const combined = steps.join(' ').toLowerCase();
    expect(combined).toMatch(/route|server|express|middleware/);
  });

  it('falls back to generic steps for unknown task types', () => {
    const steps = decomposeTask('do something random and unusual xyz123');
    expect(steps.length).toBeGreaterThan(0);
  });

  it('decomposes landing page into HTML/CSS/JS steps', () => {
    const steps = decomposeTask('build a landing page for my startup');
    const combined = steps.join(' ').toLowerCase();
    expect(combined).toMatch(/html|css|javascript|style/);
  });

  it('decomposes ecommerce into product/cart/checkout steps', () => {
    const steps = decomposeTask('build an ecommerce shop with products and cart');
    const combined = steps.join(' ').toLowerCase();
    expect(combined).toMatch(/product|cart|checkout/);
  });
});

// ── getRelevantPatterns ───────────────────────────────────────────────────────

describe('getRelevantPatterns', () => {
  it('returns empty array when no patterns stored', () => {
    mockLocalStorage.getItem.mockReturnValueOnce(null);
    const patterns = getRelevantPatterns('build a React app');
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBe(0);
  });

  it('returns matching patterns from localStorage', () => {
    const stored = JSON.stringify([
      {
        task: 'build a React dashboard',
        keywords: ['build', 'react', 'dashboard'],
        success: true,
        filesCount: 3,
        timestampMs: Date.now()
      }
    ]);
    mockLocalStorage.getItem.mockReturnValueOnce(stored);
    const patterns = getRelevantPatterns('build a React dashboard with charts');
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('returns empty array when localStorage throws', () => {
    mockLocalStorage.getItem.mockImplementationOnce(() => { throw new Error('Storage error'); });
    const patterns = getRelevantPatterns('anything');
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBe(0);
  });

  it('returns at most 5 patterns', () => {
    const stored = JSON.stringify(
      Array.from({ length: 10 }, (_, i) => ({
        task: `build react app ${i}`,
        keywords: ['build', 'react'],
        success: true,
        filesCount: 1,
        timestampMs: Date.now() + i
      }))
    );
    mockLocalStorage.getItem.mockReturnValueOnce(stored);
    const patterns = getRelevantPatterns('build react components');
    expect(patterns.length).toBeLessThanOrEqual(5);
  });
});

// ── buildThinkingPrompt ───────────────────────────────────────────────────────

describe('buildThinkingPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildThinkingPrompt('build a todo app', null, {}, [], null);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes task text in prompt', () => {
    const prompt = buildThinkingPrompt('build a React dashboard', null, {}, [], null);
    expect(prompt).toContain('build a React dashboard');
  });

  it('includes plan preview when provided', () => {
    const plan = { plan: 'Create a 3-file React app', files: ['App.jsx'], reasoning: 'minimal approach' };
    const prompt = buildThinkingPrompt('build app', plan, {}, [], null);
    expect(prompt).toContain('Create a 3-file React app');
  });

  it('includes project structure when provided', () => {
    const ctx = { structure: 'src/App.jsx\nsrc/index.js', packageJson: null, existingCode: {} };
    const prompt = buildThinkingPrompt('build app', null, ctx, [], null);
    expect(prompt).toContain('src/App.jsx');
  });

  it('includes lesson from past patterns when pattern was successful', () => {
    const patterns = [
      {
        task: 'build React app',
        keywords: ['react'],
        success: true,
        filesCount: 2,
        timestampMs: Date.now(),
        relevance: 2
      }
    ];
    const prompt = buildThinkingPrompt('build app', null, {}, patterns, null);
    expect(prompt).toMatch(/succeed|files/i);
  });

  it('includes recent conversation context', () => {
    const history = [
      { role: 'user', content: 'I want a dashboard' },
      { role: 'assistant', content: 'I can help with that' }
    ];
    const prompt = buildThinkingPrompt('build app', null, {}, [], history);
    expect(prompt).toContain('dashboard');
  });

  it('includes dependency list from packageJson', () => {
    const ctx = {
      structure: '',
      packageJson: { dependencies: { react: '^18', vite: '^5' }, devDependencies: {} },
      existingCode: {}
    };
    const prompt = buildThinkingPrompt('build app', null, ctx, [], null);
    expect(prompt).toContain('react');
  });
});
