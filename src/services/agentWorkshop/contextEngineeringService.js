export function createScopedContextPacket({
  traceId,
  projectId,
  agentId,
  objective,
  relevantFiles = [],
  workspaceMemory = [],
  taskPackets = []
}) {
  return {
    id: `ctx-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    traceId: traceId || null,
    projectId: projectId || null,
    agentId,
    objective: objective || '',
    relevantFiles: relevantFiles.slice(0, 40),
    workspaceMemory: workspaceMemory.slice(0, 30),
    taskPackets: taskPackets.slice(0, 20),
    policy: {
      contextMode: 'scoped',
      includeWholeWorkspace: false,
      maxTokenWasteGuard: true
    },
    createdAt: new Date().toISOString()
  };
}

export function buildAgentScopedContexts({ traceId, projectId, tasksByAgent = {}, projectDna = {} }) {
  return Object.entries(tasksByAgent).reduce((acc, [agentId, tasks]) => {
    acc[agentId] = createScopedContextPacket({
      traceId,
      projectId,
      agentId,
      objective: `Complete assigned ${agentId} tasks with minimal scoped context.`,
      relevantFiles: (projectDna.relevantFilesByAgent?.[agentId] || []).slice(0, 20),
      workspaceMemory: projectDna.memoryHints || [],
      taskPackets: tasks
    });
    return acc;
  }, {});
}

