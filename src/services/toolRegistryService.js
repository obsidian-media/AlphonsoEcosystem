// Tool registry — structured function calling for agents
// Each tool has: name, description, parameters (JSON Schema), execute function

const TOOLS = {
  // File operations
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

  // Command execution
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

  // Web operations
  fetch_url: {
    name: 'fetch_url',
    description: 'Fetch content from a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' }
      },
      required: ['url']
    }
  },

  // Composio external tools
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

  // Memory operations
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

  // Git operations
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

export function getToolDefinitions() {
  return Object.values(TOOLS).map(({ name, description, parameters }) => ({
    name,
    description,
    parameters
  }));
}

export function getToolDefinition(name) {
  return TOOLS[name] || null;
}

export function getAllToolNames() {
  return Object.keys(TOOLS);
}

export function formatToolsForPrompt() {
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

export async function executeTool(name, args, context = {}) {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}`, success: false };

  switch (name) {
    case 'read_file': {
      const { readWorkspaceFile } = await import('./workspaceFileService');
      return readWorkspaceFile({ workspaceRoot: context.workspaceRoot || '', relativePath: args.path });
    }

    case 'write_file': {
      const { writeWorkspaceArtifact } = await import('./workspaceArtifactService');
      await writeWorkspaceArtifact({
        workspaceRoot: context.workspaceRoot || '',
        relativePath: args.path,
        content: args.content
      });
      return { success: true, path: args.path, bytes: args.content.length };
    }

    case 'delete_file': {
      const { deleteWorkspaceFile } = await import('./workspaceFileService');
      return deleteWorkspaceFile({ workspaceRoot: context.workspaceRoot || '', relativePath: args.path });
    }

    case 'move_file': {
      const { moveWorkspaceFile } = await import('./workspaceFileService');
      return moveWorkspaceFile({ workspaceRoot: context.workspaceRoot || '', fromRelative: args.from, toRelative: args.to });
    }

    case 'search_files': {
      const { searchWorkspaceFiles } = await import('./workspaceFileService');
      return searchWorkspaceFiles({
        workspaceRoot: context.workspaceRoot || '',
        query: args.query,
        caseSensitive: args.caseSensitive || false
      });
    }

    case 'list_directory': {
      const { listWorkspaceDirectory } = await import('./workspaceFileService');
      return listWorkspaceDirectory({
        workspaceRoot: context.workspaceRoot || '',
        relativePath: args.path || '',
        recursive: args.recursive || false
      });
    }

    case 'run_command': {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('execute_command_verified', { program: args.program, args: args.args || [] });
    }

    case 'fetch_url': {
      const response = await fetch(args.url, { method: args.method || 'GET' });
      const text = await response.text();
      return { success: response.ok, status: response.status, content: text.slice(0, 10000) };
    }

    case 'use_composio_tool': {
      const { executeViaComposio } = await import('./composioService');
      return executeViaComposio(`${args.action} with ${JSON.stringify(args.params || {})}`, 'alphonso', {
        toolkits: [args.toolkit],
        endpoint: context.endpoint
      });
    }

    case 'save_memory': {
      const { pushMemoryItem } = await import('./memoryService');
      const item = pushMemoryItem({
        title: args.title,
        content: args.content,
        category: args.category || 'timeline_memory',
        source: 'agent-tool',
        sourceAgent: context.agent || 'alphonso'
      });
      return { success: true, id: item.id };
    }

    case 'search_memory': {
      const { searchMemory } = await import('./searchService');
      return searchMemory(args.query, { limit: 20 });
    }

    case 'git_commit': {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('execute_command_verified', { program: 'git', args: ['add', '-A'] });
      const result = await invoke('execute_command_verified', { program: 'git', args: ['commit', '-m', args.message] });
      return { success: result?.payload?.exitCode === 0, output: result?.payload?.stdout || '' };
    }

    case 'git_status': {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('execute_command_verified', { program: 'git', args: ['status', '--short'] });
      return { output: result?.payload?.stdout || '', exitCode: result?.payload?.exitCode };
    }

    default:
      return { error: `Tool not implemented: ${name}`, success: false };
  }
}
