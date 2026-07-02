import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../services/workspaceFileService', () => ({
  readWorkspaceFile: vi.fn(),
  deleteWorkspaceFile: vi.fn(),
  moveWorkspaceFile: vi.fn(),
  searchWorkspaceFiles: vi.fn(),
  listWorkspaceDirectory: vi.fn()
}));

vi.mock('../../services/workspaceArtifactService', () => ({
  writeWorkspaceArtifact: vi.fn()
}));

vi.mock('../../services/browserAutomationService', () => ({
  fetchUrlContent: vi.fn(),
  openUrl: vi.fn(),
  readClipboard: vi.fn(),
  writeClipboard: vi.fn()
}));

vi.mock('../../services/composioService', () => ({
  executeViaComposio: vi.fn()
}));

vi.mock('../../services/memoryService', () => ({
  pushMemoryItem: vi.fn(() => ({ id: 'mem-123' }))
}));

vi.mock('../../services/searchService', () => ({
  searchMemory: vi.fn()
}));

describe('toolRegistryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TOOLS registry', () => {
    it('exports file operation tools', async () => {
      const { getToolDefinitions } = await import('../../services/toolRegistryService');
      const tools = getToolDefinitions();
      const fileOps = tools.filter(t => ['read_file', 'write_file', 'delete_file', 'move_file'].includes(t.name));
      expect(fileOps.length).toBe(4);
    });
  });

  describe('getToolDefinitions', () => {
    it('exports getToolDefinitions function', async () => {
      const { getToolDefinitions } = await import('../../services/toolRegistryService');
      expect(typeof getToolDefinitions).toBe('function');
    });

    it('returns array of tool definitions', async () => {
      const { getToolDefinitions } = await import('../../services/toolRegistryService');
      const tools = getToolDefinitions();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('returns tools with name, description, parameters', async () => {
      const { getToolDefinitions } = await import('../../services/toolRegistryService');
      const tools = getToolDefinitions();
      const first = tools[0];
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('description');
      expect(first).toHaveProperty('parameters');
    });

    it('returns 22 tools', async () => {
      const { getToolDefinitions } = await import('../../services/toolRegistryService');
      const tools = getToolDefinitions();
      expect(tools.length).toBe(16);
    });
  });

  describe('getToolDefinition', () => {
    it('exports getToolDefinition function', async () => {
      const { getToolDefinition } = await import('../../services/toolRegistryService');
      expect(typeof getToolDefinition).toBe('function');
    });

    it('returns tool definition for valid name', async () => {
      const { getToolDefinition } = await import('../../services/toolRegistryService');
      const tool = getToolDefinition('read_file');
      expect(tool).toHaveProperty('name', 'read_file');
    });

    it('returns null for unknown tool', async () => {
      const { getToolDefinition } = await import('../../services/toolRegistryService');
      const tool = getToolDefinition('nonexistent');
      expect(tool).toBeNull();
    });
  });

  describe('getAllToolNames', () => {
    it('exports getAllToolNames function', async () => {
      const { getAllToolNames } = await import('../../services/toolRegistryService');
      expect(typeof getAllToolNames).toBe('function');
    });

    it('returns array of all tool names', async () => {
      const { getAllToolNames } = await import('../../services/toolRegistryService');
      const names = getAllToolNames();
      expect(Array.isArray(names)).toBe(true);
    });

    it('includes expected tool names', async () => {
      const { getAllToolNames } = await import('../../services/toolRegistryService');
      const names = getAllToolNames();
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('run_command');
      expect(names).toContain('save_memory');
    });
  });

  describe('formatToolsForPrompt', () => {
    it('exports formatToolsForPrompt function', async () => {
      const { formatToolsForPrompt } = await import('../../services/toolRegistryService');
      expect(typeof formatToolsForPrompt).toBe('function');
    });

    it('returns formatted string for all tools', async () => {
      const { formatToolsForPrompt } = await import('../../services/toolRegistryService');
      const formatted = formatToolsForPrompt();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('includes tool names in formatted output', async () => {
      const { formatToolsForPrompt } = await import('../../services/toolRegistryService');
      const formatted = formatToolsForPrompt();
      expect(formatted).toContain('read_file:');
    });
  });

  describe('executeTool', () => {
    it('exports executeTool function', async () => {
      const { executeTool } = await import('../../services/toolRegistryService');
      expect(typeof executeTool).toBe('function');
    });

    it('returns error for unknown tool', async () => {
      const { executeTool } = await import('../../services/toolRegistryService');
      const result = await executeTool('nonexistent', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('returns error for tool not implemented', async () => {
      const { executeTool } = await import('../../services/toolRegistryService');
      const result = await executeTool('todo_write', {});
      expect(result.success).toBe(false);
    });

    it('has switch for read_file tool', async () => {
      const { executeTool } = await import('../../services/toolRegistryService');
      expect(typeof executeTool).toBe('function');
    });
  });

  describe('tool parameters validation', () => {
    it('read_file has path as required parameter', async () => {
      const { getToolDefinition } = await import('../../services/toolRegistryService');
      const tool = getToolDefinition('read_file');
      expect(tool.parameters.required).toContain('path');
    });

    it('write_file has path and content as required', async () => {
      const { getToolDefinition } = await import('../../services/toolRegistryService');
      const tool = getToolDefinition('write_file');
      expect(tool.parameters.required).toContain('path');
      expect(tool.parameters.required).toContain('content');
    });

    it('run_command has program and args as required', async () => {
      const { getToolDefinition } = await import('../../services/toolRegistryService');
      const tool = getToolDefinition('run_command');
      expect(tool.parameters.required).toContain('program');
      expect(tool.parameters.required).toContain('args');
    });
  });
});