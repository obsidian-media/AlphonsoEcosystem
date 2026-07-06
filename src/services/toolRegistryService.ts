// Tool registry — structured function calling for agents

export interface ToolParameterSchema {
  type: string;
  description?: string;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  items?: { type: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface ToolExecutionResult {
  [key: string]: unknown;
  error?: string;
  success?: boolean;
}

export interface ToolContext {
  workspaceRoot?: string;
  endpoint?: string;
  agent?: string;
}

export interface ToolArgs {
  [key: string]: unknown;
}

const TOOLS: Record<string, ToolDefinition> = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file in the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    }
  },

  write_file: {
    name: 'write_file',
    description: 'Write content to a file in the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    }
  },

  delete_file: {
    name: 'delete_file',
    description: 'Delete a file from the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the file' }
      },
      required: ['path']
    }
  },

  move_file: {
    name: 'move_file',
    description: 'Move or rename a file',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source path' },
        to: { type: 'string', description: 'Destination path' }
      },
      required: ['from', 'to']
    }
  },

  search_files: {
    name: 'search_files',
    description: 'Search for text content across workspace files',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        caseSensitive: { type: 'boolean', description: 'Case sensitive search' }
      },
      required: ['query']
    }
  },

  list_directory: {
    name: 'list_directory',
    description: 'List files and directories in a workspace path',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory path (empty for root)' },
        recursive: { type: 'boolean', description: 'List recursively' }
      },
      required: []
    }
  },

  run_command: {
    name: 'run_command',
    description: 'Execute a command in the workspace',
    parameters: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'Program to run (npm, node, python, git, etc.)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' }
      },
      required: ['program', 'args']
    }
  },

  fetch_url: {
    name: 'fetch_url',
    description: 'Fetch and extract text content from a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' }
      },
      required: ['url']
    }
  },

  open_url: {
    name: 'open_url',
    description: 'Open a URL in the default browser',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open' }
      },
      required: ['url']
    }
  },

  read_clipboard: {
    name: 'read_clipboard',
    description: 'Read text content from the system clipboard',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  write_clipboard: {
    name: 'write_clipboard',
    description: 'Write text content to the system clipboard',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text to copy to clipboard' }
      },
      required: ['content']
    }
  },

  use_composio_tool: {
    name: 'use_composio_tool',
    description: 'Use an external tool via Composio (GitHub, Slack, Notion, Jira, etc.)',
    parameters: {
      type: 'object',
      properties: {
        toolkit: { type: 'string', description: 'Toolkit name (github, slack, notion, etc.)' },
        action: { type: 'string', description: 'Action to perform' },
        params: { type: 'object', description: 'Action parameters' }
      },
      required: ['toolkit', 'action']
    }
  },

  save_memory: {
    name: 'save_memory',
    description: 'Save information to agent memory for later retrieval',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Memory title' },
        content: { type: 'string', description: 'Memory content' },
        category: { type: 'string', description: 'Memory category' }
      },
      required: ['title', 'content']
    }
  },

  search_memory: {
    name: 'search_memory',
    description: 'Search agent memory for relevant information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' }
      },
      required: ['query']
    }
  },

  git_commit: {
    name: 'git_commit',
    description: 'Commit current changes to git',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' }
      },
      required: ['message']
    }
  },

  git_status: {
    name: 'git_status',
    description: 'Check git status',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

export function getToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOLS).map(({ name, description, parameters }) => ({
    name,
    description,
    parameters
  }));
}

export function getToolDefinition(name: string): ToolDefinition | null {
  return TOOLS[name] || null;
}

export function getAllToolNames(): string[] {
  return Object.keys(TOOLS);
}

export function formatToolsForPrompt(): string {
  return Object.values(TOOLS)
    .map((tool) => {
      const params = Object.entries(tool.parameters.properties || {})
        .map(([key, schema]) => {
          const required = tool.parameters.required?.includes(key);
          return `  - ${key}${required ? ' (required)' : ''}: ${schema.description} (${schema.type})`;
        })
        .join('\n');
      return `${tool.name}: ${tool.description}\n${params}`;
    })
    .join('\n\n');
}

export async function executeTool(name: string, args: ToolArgs, context: ToolContext = {}): Promise<ToolExecutionResult> {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}`, success: false };

  switch (name) {
    case 'read_file': {
      const { readWorkspaceFile } = await import('./workspaceFileService');
      return readWorkspaceFile({ workspaceRoot: context.workspaceRoot || '', relativePath: args.path as string }) as unknown as ToolExecutionResult;
    }

    case 'write_file': {
      const { writeWorkspaceArtifact } = await import('./workspaceArtifactService');
      await writeWorkspaceArtifact({
        workspaceRoot: context.workspaceRoot || '',
        relativePath: args.path as string,
        content: args.content as string
      });
      return { success: true, path: args.path, bytes: (args.content as string).length } as ToolExecutionResult;
    }

    case 'delete_file': {
      const { deleteWorkspaceFile } = await import('./workspaceFileService');
      return deleteWorkspaceFile({ workspaceRoot: context.workspaceRoot || '', relativePath: args.path as string }) as unknown as ToolExecutionResult;
    }

    case 'move_file': {
      const { moveWorkspaceFile } = await import('./workspaceFileService');
      return moveWorkspaceFile({ workspaceRoot: context.workspaceRoot || '', fromRelative: args.from as string, toRelative: args.to as string }) as unknown as ToolExecutionResult;
    }

    case 'search_files': {
      const { searchWorkspaceFiles } = await import('./workspaceFileService');
      return searchWorkspaceFiles({
        workspaceRoot: context.workspaceRoot || '',
        query: args.query as string,
        caseSensitive: (args.caseSensitive as boolean) || false
      }) as unknown as ToolExecutionResult;
    }

    case 'list_directory': {
      const { listWorkspaceDirectory } = await import('./workspaceFileService');
      return listWorkspaceDirectory({
        workspaceRoot: context.workspaceRoot || '',
        relativePath: (args.path as string) || '',
        recursive: (args.recursive as boolean) || false
      }) as unknown as ToolExecutionResult;
    }

    case 'run_command': {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('execute_command_verified', { program: args.program, args: (args.args as string[]) || [] }) as unknown as ToolExecutionResult;
    }

    case 'fetch_url': {
      const { fetchUrlContent } = await import('./browserAutomationService');
      return fetchUrlContent(args.url as string) as unknown as ToolExecutionResult;
    }

    case 'open_url': {
      const { openUrl } = await import('./browserAutomationService');
      return openUrl(args.url as string) as unknown as ToolExecutionResult;
    }

    case 'read_clipboard': {
      const { readClipboard } = await import('./browserAutomationService');
      return readClipboard() as unknown as ToolExecutionResult;
    }

    case 'write_clipboard': {
      const { writeClipboard } = await import('./browserAutomationService');
      return writeClipboard(args.content as string) as unknown as ToolExecutionResult;
    }

    case 'use_composio_tool': {
      const { executeViaComposio } = await import('./composioService');
      return executeViaComposio(`${args.action} with ${JSON.stringify(args.params || {})}`, 'alphonso', {
        toolkits: [args.toolkit as string],
        endpoint: context.endpoint
      }) as unknown as ToolExecutionResult;
    }

    case 'save_memory': {
      const { pushMemoryItem } = await import('./memoryService');
      const item = pushMemoryItem({
        title: args.title as string,
        content: args.content as string,
        category: (args.category as string) || 'timeline_memory',
        source: 'agent-tool',
        sourceAgent: context.agent || 'alphonso'
      }) as { id?: string };
      return { success: true, id: item.id } as ToolExecutionResult;
    }

    case 'search_memory': {
      const { searchMemory } = await import('./searchService');
      return searchMemory(args.query as string, { limit: 20 }) as unknown as ToolExecutionResult;
    }

    case 'git_commit': {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('execute_command_verified', { program: 'git', args: ['add', '-A'] });
      const result = await invoke('execute_command_verified', { program: 'git', args: ['commit', '-m', args.message] }) as { payload?: { exitCode?: number; stdout?: string } };
      return { success: result?.payload?.exitCode === 0, output: result?.payload?.stdout || '' } as ToolExecutionResult;
    }

    case 'git_status': {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('execute_command_verified', { program: 'git', args: ['status', '--short'] }) as { payload?: { stdout?: string; exitCode?: number } };
      return { output: result?.payload?.stdout || '', exitCode: result?.payload?.exitCode } as ToolExecutionResult;
    }

    default:
      return { error: `Tool not implemented: ${name}`, success: false };
  }
}
