import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(),
  generateOllamaStream: vi.fn(),
}));

vi.mock('../../lib/jsonUtils', () => ({
  parseJsonResponse: vi.fn(),
}));

vi.mock('../../services/verificationService', () => ({
  verifyCommandExecution: vi.fn(),
}));

vi.mock('../../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn(),
}));

vi.mock('../../services/memoryService', () => ({
  pushMemoryItem: vi.fn(),
}));

vi.mock('../../services/modelSelectionService', () => ({
  getModelForTask: vi.fn(() => 'test-model'),
}));

vi.mock('../../services/autoRunService', () => ({
  autoRunDevServer: vi.fn(),
  getAutoRunEnabled: vi.fn(() => false),
}));

vi.mock('../../services/composioService', () => ({
  isComposioEnabled: vi.fn(() => false),
  executeViaComposio: vi.fn(),
}));

vi.mock('../../services/agentMetricsService', () => ({
  recordAgentExecution: vi.fn(),
}));

vi.mock('../../services/toolRegistryService', () => ({
  getToolDefinitions: vi.fn(() => []),
  formatToolsForPrompt: vi.fn(() => ''),
  executeTool: vi.fn(),
}));

import {
  needsClarification,
  decomposeTask,
  getRelevantPatterns,
  buildThinkingPrompt,
} from '../../services/agentBrainService';

const PATTERN_MEMORY_KEY = 'alphonso_brain_patterns_v1';

describe('agentBrainService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('needsClarification', () => {
    it('returns true for vague short requests', () => {
      expect(needsClarification('make an app')).toBe(true);
    });

    it('returns true for no-action short requests', () => {
      expect(needsClarification('the website is broken')).toBe(true);
    });

    it('returns false for specific requests', () => {
      expect(needsClarification('create a full-stack React dashboard with authentication')).toBe(false);
    });

    it('returns false for requests with action verbs and specificity', () => {
      expect(needsClarification('build a todo app with React and localStorage')).toBe(false);
    });

    it('returns true for very short inputs', () => {
      expect(needsClarification('hi')).toBe(true);
    });

    it('returns true for inputs with fewer than 4 words', () => {
      expect(needsClarification('make stuff')).toBe(true);
    });

    it('returns false for long specific requests even with vague words', () => {
      expect(needsClarification('create a dashboard app with login page and admin panel')).toBe(false);
    });

    it('returns true for 30+ char vague requests', () => {
      expect(needsClarification('make something cool for my')).toBe(true);
    });

    it('returns false for requests with known project types', () => {
      expect(needsClarification('build a ecommerce shop with cart')).toBe(false);
    });

    it('returns false for requests with chat/messenger', () => {
      expect(needsClarification('create a chat app with real-time messaging')).toBe(false);
    });
  });

  describe('decomposeTask', () => {
    it('decomposes fullstack task', () => {
      const steps = decomposeTask('build a full-stack MERN app');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('server');
      expect(steps[1]).toContain('client');
      expect(steps[2]).toContain('config');
    });

    it('decomposes dashboard task', () => {
      const steps = decomposeTask('create a dashboard admin panel');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('layout');
      expect(steps[1]).toContain('cards');
    });

    it('decomposes api task', () => {
      const steps = decomposeTask('build an API backend');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('Express');
      expect(steps[1]).toContain('CRUD');
    });

    it('decomposes landing page task', () => {
      const steps = decomposeTask('create a landing page website');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('hero');
      expect(steps[1]).toContain('CSS');
    });

    it('decomposes todo task', () => {
      const steps = decomposeTask('build a todo checklist app');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('data model');
    });

    it('decomposes portfolio task', () => {
      const steps = decomposeTask('create a portfolio resume site');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('hero');
    });

    it('decomposes chat task', () => {
      const steps = decomposeTask('make a messenger chat app');
      expect(steps.length).toBe(3);
      expect(steps[1]).toContain('chat UI');
    });

    it('decomposes weather task', () => {
      const steps = decomposeTask('build a weather forecast app');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('API integration');
    });

    it('decomposes calculator task', () => {
      const steps = decomposeTask('create a calculator');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('calculation engine');
    });

    it('decomposes blog task', () => {
      const steps = decomposeTask('write a blog article CMS');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('post/article');
    });

    it('decomposes ecommerce task', () => {
      const steps = decomposeTask('build an ecommerce shop with cart');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('product');
      expect(steps[2]).toContain('checkout');
    });

    it('decomposes generic task', () => {
      const steps = decomposeTask('fix the bug in my code');
      expect(steps.length).toBe(3);
      expect(steps[0]).toContain('entry point');
    });
  });

  describe('getRelevantPatterns', () => {
    it('returns empty for no stored patterns', () => {
      expect(getRelevantPatterns('test task')).toEqual([]);
    });

    it('returns matching patterns by keyword overlap', () => {
      const patterns = [
        { task: 'build react app', keywords: ['build', 'react', 'app'], success: true, filesCount: 3, errorSnippet: null, timestampMs: 1000 },
        { task: 'fix css bug', keywords: ['fix', 'css', 'bug'], success: true, filesCount: 1, errorSnippet: null, timestampMs: 2000 },
      ];
      localStorage.setItem(PATTERN_MEMORY_KEY, JSON.stringify(patterns));

      const result = getRelevantPatterns('build a react application');
      expect(result.length).toBe(1);
      expect(result[0].task).toBe('build react app');
      expect(result[0].relevance).toBeGreaterThanOrEqual(2);
    });

    it('sorts by relevance then recency', () => {
      const patterns = [
        { task: 'old react build', keywords: ['old', 'react', 'build'], success: true, filesCount: 2, errorSnippet: null, timestampMs: 1000 },
        { task: 'new react build app', keywords: ['new', 'react', 'build', 'app'], success: true, filesCount: 3, errorSnippet: null, timestampMs: 2000 },
      ];
      localStorage.setItem(PATTERN_MEMORY_KEY, JSON.stringify(patterns));

      const result = getRelevantPatterns('react build something');
      expect(result.length).toBe(2);
      // Newer one should rank higher due to higher relevance
      expect(result[0].task).toBe('new react build app');
    });

    it('limits to 5 results', () => {
      const patterns = Array.from({ length: 10 }, (_, i) => ({
        task: `task ${i} with react keywords`,
        keywords: ['task', `${i}`, 'with', 'react', 'keywords'],
        success: true,
        filesCount: 1,
        errorSnippet: null,
        timestampMs: 1000 + i,
      }));
      localStorage.setItem(PATTERN_MEMORY_KEY, JSON.stringify(patterns));

      const result = getRelevantPatterns('task with react keywords');
      expect(result.length).toBe(5);
    });

    it('returns empty when no keyword overlap', () => {
      const patterns = [
        { task: 'fix css bug', keywords: ['fix', 'css', 'bug'], success: true, filesCount: 1, errorSnippet: null, timestampMs: 1000 },
      ];
      localStorage.setItem(PATTERN_MEMORY_KEY, JSON.stringify(patterns));

      expect(getRelevantPatterns('deploy to aws')).toEqual([]);
    });
  });

  describe('buildThinkingPrompt', () => {
    it('includes task text', () => {
      const prompt = buildThinkingPrompt('build a todo app', null, {}, [], null);
      expect(prompt).toContain('build a todo app');
    });

    it('includes project structure when present', () => {
      const ctx = { structure: 'src/\nindex.js' };
      const prompt = buildThinkingPrompt('test', null, ctx, [], null);
      expect(prompt).toContain('Existing project files');
      expect(prompt).toContain('src/');
    });

    it('includes package.json dependencies', () => {
      const ctx = { packageJson: { dependencies: { react: '^18.0.0', vite: '^5.0.0' } } };
      const prompt = buildThinkingPrompt('test', null, ctx, [], null);
      expect(prompt).toContain('Installed dependencies');
      expect(prompt).toContain('react');
    });

    it('includes dev dependencies', () => {
      const ctx = { packageJson: { devDependencies: { vitest: '^1.0.0' } } };
      const prompt = buildThinkingPrompt('test', null, ctx, [], null);
      expect(prompt).toContain('Dev dependencies');
      expect(prompt).toContain('vitest');
    });

    it('includes existing source code', () => {
      const ctx = { existingCode: { 'src/App.jsx': 'export default function App() {}' } };
      const prompt = buildThinkingPrompt('test', null, ctx, [], null);
      expect(prompt).toContain('Existing source code');
      expect(prompt).toContain('App.jsx');
    });

    it('includes lessons from patterns', () => {
      const patterns = [
        { task: 'build react app', success: true, filesCount: 3, errorSnippet: null },
        { task: 'fix bug in api', success: false, filesCount: 0, errorSnippet: 'timeout error' },
      ];
      const prompt = buildThinkingPrompt('test', null, {}, patterns, null);
      expect(prompt).toContain('Lessons from past tasks');
      expect(prompt).toContain('succeeded with 3 files');
      expect(prompt).toContain('FAILED');
      expect(prompt).toContain('timeout error');
    });

    it('includes plan preview', () => {
      const plan = { plan: 'Create a todo app with React' };
      const prompt = buildThinkingPrompt('test', plan, {}, [], null);
      expect(prompt).toContain('Planned approach');
      expect(prompt).toContain('Create a todo app with React');
    });

    it('includes conversation context (last 6 messages)', () => {
      const conversation = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: 'build a todo' },
        { role: 'assistant', content: 'sure' },
        { role: 'user', content: 'with dark mode' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'add tests too' },
      ];
      const prompt = buildThinkingPrompt('test', null, {}, [], conversation);
      expect(prompt).toContain('Recent conversation');
      expect(prompt).toContain('User: add tests too');
    });

    it('uses only last 6 conversation messages', () => {
      const conversation = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message ${i}`,
      }));
      const prompt = buildThinkingPrompt('test', null, {}, [], conversation);
      expect(prompt).toContain('message 9');
      expect(prompt).not.toContain('message 3');
    });

    it('truncates long message content to 200 chars', () => {
      const longContent = 'x'.repeat(300);
      const conversation = [{ role: 'user', content: longContent }];
      const prompt = buildThinkingPrompt('test', null, {}, [], conversation);
      expect(prompt).not.toContain('x'.repeat(201));
    });

    it('returns prompt with required sections', () => {
      const prompt = buildThinkingPrompt('test', null, {}, [], null);
      expect(prompt).toContain('You are Alphonso');
      expect(prompt).toContain('RULES');
      expect(prompt).toContain('OUTPUT SCHEMA');
      expect(prompt).toContain('TASK: test');
      expect(prompt).toContain('Think step by step');
    });
  });
});
